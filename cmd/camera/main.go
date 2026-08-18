package main

import (
	"context"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	osexec "os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"camera/frontend"
	"camera/internal/config"
	"camera/internal/core"
	"camera/internal/db"
	"camera/internal/dbbackup"
	"camera/internal/email"
	"camera/internal/exec"
	"camera/internal/extensions/telegram"
	"camera/internal/ffprobe"
	"camera/internal/logger"
	"camera/internal/motion"
	"camera/internal/notifications"
	"camera/internal/notifications/application"
	notifyemail "camera/internal/notifications/email"
	telegramnotify "camera/internal/notifications/telegram"
	"camera/internal/recorder"
	"camera/internal/release"
	"camera/internal/server"
	"camera/internal/storage"
	"camera/internal/transmission/hls"
	"camera/internal/transmission/webrtc"
	"camera/internal/updater"
	"camera/internal/zones"
)

var version = "dev"
var commit = ""
var builtAt = ""

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "init":
			runInit(os.Args[2:])
			return
		case "config":
			runConfig(os.Args[2:])
			return
		case "version", "--version", "-v":
			printVersion()
			return
		case "help", "--help", "-h":
			runHelp(os.Args[2:])
			return
		default:
			// Flags do modo servidor (ex.: --config) caem no flag.Parse abaixo;
			// qualquer outra coisa que não seja flag é comando desconhecido.
			if !strings.HasPrefix(os.Args[1], "-") {
				unknownCommand(os.Args[1])
			}
		}
	}

	configPath := flag.String("config", "camera.yaml", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatal(err)
	}

	output := cfg.Log.Output
	if output == "" {
		output = "stdout"
	}

	slog, err := logger.New(logger.Options{
		Debug:      cfg.Debug,
		Output:     output,
		Path:       cfg.Log.Path,
		MaxSizeMB:  cfg.Log.MaxSizeMBOrDefault(),
		MaxAgeDays: cfg.Log.MaxAgeDaysOrDefault(),
		MaxBackups: cfg.Log.MaxBackupsOrDefault(),
		Compress:   cfg.Log.CompressOrDefault(),
	})
	if err != nil {
		log.Fatalf("failed to initialize logger: %v", err)
	}

	dbPath := cfg.DBPath
	if dbPath == "" {
		dbDir := cfg.Storage.Path
		if dbDir == "" {
			dbDir = "."
		}
		dbPath = filepath.Join(dbDir, "camera.db")
	}

	dbDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		log.Fatalf("failed to create database directory %q: %v\n\nHint: run as root, or set db_path in camera.yaml to a user-writable path (e.g. db_path: ./camera.db)", dbDir, err)
	}
	if tmp, err := os.CreateTemp(dbDir, ".camera_write_check_*"); err != nil {
		log.Fatalf("database directory %q is not writable: %v\n\nHint: run as root, or set db_path in camera.yaml to a user-writable path (e.g. db_path: ./camera.db)", dbDir, err)
	} else {
		tmp.Close()
		os.Remove(tmp.Name())
	}

	// Recuperação de update: lê o marcador ANTES de abrir o DB (o rollback mexe no
	// arquivo do banco fechado). Em trial, persiste a tentativa e confirma depois
	// que o server sobe; se o trial anterior não confirmou, reverte e re-executa.
	exe, _ := os.Executable()
	binDir := filepath.Dir(exe)
	inTrial := false
	if m, ok, merr := updater.ReadMarker(binDir); merr != nil {
		slog.Warn("could not read update marker", "error", merr)
	} else if ok {
		switch action, updated := updater.EvaluateBoot(m); action {
		case updater.ActionRollback:
			slog.Warn("update trial did not confirm, rolling back", "from", m.FromVersion, "to", m.ToVersion)
			if rerr := updater.Rollback(m); rerr != nil {
				slog.Error("rollback failed", "error", rerr)
				_ = updater.ClearMarker(binDir) // evita loop de rollback
			} else {
				_ = updater.ClearMarker(binDir)
				slog.Info("rolled back to previous version, restarting")
				if xerr := updater.ReexecSelf(exe); xerr != nil {
					slog.Error("re-exec after rollback failed, exiting for supervisor", "error", xerr)
					os.Exit(1)
				}
			}
		case updater.ActionTrial:
			if werr := updater.WriteMarker(binDir, updated); werr != nil {
				slog.Warn("could not persist update trial marker", "error", werr)
			}
			inTrial = true
			slog.Info("running update trial", "to", m.ToVersion)
		}
	}

	// Backup pré-migration só faz sentido se o banco JÁ existe. Num install novo
	// não há o que preservar — e tocar no arquivo antes do db.Open faria o Open
	// achar que o banco não é novo. Migrations são forward-only; o snapshot
	// permite rollback. Falha de backup é warn+segue (não bloqueia o boot).
	if _, statErr := os.Stat(dbPath); statErr == nil {
		if pending, perr := db.HasPendingMigrations(dbPath); perr != nil {
			slog.Warn("could not check pending migrations for pre-migration backup", "error", perr)
		} else if pending {
			backupDir := filepath.Join(dbDir, "backups")
			if snap, berr := dbbackup.Snapshot(dbPath, backupDir, version); berr != nil {
				slog.Warn("pre-migration db backup failed", "error", berr)
			} else {
				slog.Info("pre-migration db backup created", "snapshot", snap)
				if perr := dbbackup.Prune(backupDir, 5); perr != nil {
					slog.Warn("pruning old db backups failed", "error", perr)
				}
			}
		}
	}

	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()
	database.WithLogger(slog)

	// Semeia o admin quando NÃO há nenhum usuário — não por IsNew. Assim um banco
	// vazio (ex.: criado sem seed por um bug anterior) se auto-cura no boot.
	if users, uerr := db.ListUsers(database); uerr != nil {
		slog.Warn("could not list users for admin seed check", "error", uerr)
	} else if len(users) == 0 {
		slog.Info("no users found, seeding admin user from bootstrap config")
		if seedErr := db.SeedFromBootstrap(database, cfg); seedErr != nil {
			slog.Warn("seed from bootstrap failed", "error", seedErr)
		}
	}
	if err := db.EnsureStorageDefaults(database); err != nil {
		slog.Warn("ensure storage defaults failed", "error", err)
	}

	if n := storage.CleanOrphanedRecordings(database, slog); n > 0 {
		slog.Info("startup: orphaned recordings removed", "count", n)
	}

	cameras, err := db.ListCameras(database)
	if err != nil {
		log.Fatalf("failed to load cameras from database: %v", err)
	}
	slog.Info("cameras loaded from database", "count", len(cameras))

	// Remove HLS segment dirs left by cameras that no longer exist (deleted while
	// the server was down, or leftovers from before per-camera transport gating).
	if cfg.Server.SegmentsPath != "" {
		validIDs := make(map[string]bool, len(cameras))
		for _, c := range cameras {
			validIDs[c.ID] = true
		}
		if n := storage.CleanOrphanedSegments(cfg.Server.SegmentsPath, validIDs, slog); n > 0 {
			slog.Info("startup: orphaned HLS segment dirs removed", "count", n)
		}
	}

	commander := exec.NewFFmpegCommander()
	prober := ffprobe.NewProber(&ffprobe.OSExecutor{})

	ctx, cancel := context.WithCancel(context.Background())

	var (
		camMu          sync.Mutex
		cancelsByID    = make(map[string]context.CancelFunc)
		motionMonsByID = make(map[string]*motion.Monitor)
		streamsByID    = make(map[string]ffprobe.StreamInfo)
		livePubsByID   = make(map[string]*webrtc.Publisher)
		wg             sync.WaitGroup
	)

	// srv is assigned after NewServer; callbacks close over this variable.
	var srv *server.Server
	// dispatcher fans every notification (update available, state transition,
	// disk usage) out to every configured sender — shared by srv and the
	// storage.Cleaner below, built once database is known.
	var dispatcher *notifications.Dispatcher

	// onMotionEvent's return value gates whether the event is broadcast to
	// Events()/the SSE motion bell (see motion.New's doc comment) — only
	// true when a recording actually backs the event, same "sem gravação"
	// criterion the Momentos badge uses (feat/badge-momento-sem-gravacao,
	// internal/server/moments.go's recordingCoversWindow): a camera can run
	// with motion detection on and recording off, in which case its events
	// never have anything to show and shouldn't notify anyone (sino or
	// Telegram).
	onMotionEvent := func(cameraID string, t time.Time, score float64, frame, label, color string, bbox motion.BBox) bool {
		ev := db.MotionEvent{
			CameraID:   cameraID,
			OccurredAt: t,
			Score:      score,
			FramePath:  frame,
			Label:      label,
			Color:      color,
			BboxX:      bbox.X,
			BboxY:      bbox.Y,
			BboxW:      bbox.W,
			BboxH:      bbox.H,
		}
		motionEventID, insertErr := db.InsertMotionEventReturningID(database, ev)
		if insertErr != nil {
			slog.Warn("failed to record motion event in DB", "camera", cameraID, "error", insertErr)
		}
		if err := db.MarkRecordingHasMotion(database, cameraID, t, t.Add(time.Second)); err != nil {
			slog.Warn("failed to mark recording has_motion", "camera", cameraID, "error", err)
		}

		lead, trail := 10, 10
		if cam, err := db.GetCamera(database, cameraID); err == nil {
			mc := cam.EffectiveMotionConfig()
			if mc.PlaybackLeadSeconds > 0 {
				lead = mc.PlaybackLeadSeconds
			}
			if mc.PlaybackTrailSeconds > 0 {
				trail = mc.PlaybackTrailSeconds
			}
		}
		rec, hasRecording, err := db.FindRecordingCoveringMotion(database, cameraID, t, lead, trail)
		if err != nil {
			slog.Warn("failed to check for a covering recording", "camera", cameraID, "error", err)
		}
		if !hasRecording {
			return false
		}
		// motionEventID só é confiável quando o insert acima teve sucesso —
		// sem isso, o link da notificação apontaria pro evento errado (id 0).
		notifyReady := srv != nil && insertErr == nil
		if !rec.EndedAt.IsZero() {
			// Linha já fechada: cobertura confirmada, notifica na hora — é o
			// caso comum/saudável, sem nenhum atraso.
			if notifyReady {
				srv.NotifyCameraMotion(cameraID, t, score, frame, rec.ID, motionEventID)
			}
		} else if notifyReady {
			// Linha ainda aberta: a checagem síncrona é uma aposta sobre o
			// futuro próximo (ver work_progress/analysis/202608172149_...) —
			// adia a notificação persistente (sino/Telegram) num recheck
			// assíncrono, sem bloquear este loop de frames do motion. O
			// flash ao vivo (retorno abaixo) já disparou, sem esperar isso.
			ticker := time.NewTicker(deferredNotifyPollInterval)
			go func() {
				defer ticker.Stop()
				deferredNotifyMotion(
					func() (db.Recording, bool) {
						r, ok, err := db.FindRecordingCoveringMotion(database, cameraID, t, lead, trail)
						if err != nil {
							slog.Warn("failed to recheck for a covering recording", "camera", cameraID, "error", err)
							return db.Recording{}, false
						}
						return r, ok
					},
					ticker.C,
					deferredNotifyMaxTicks,
					func(r db.Recording) {
						srv.NotifyCameraMotion(cameraID, t, score, frame, r.ID, motionEventID)
					},
				)
			}()
		}
		return true
	}

	startCameraProcs := func(cam config.CameraConfig) {
		stream := ffprobe.Resolve(context.Background(), ffprobe.Resolver{
			VideoCodec:  cam.VideoCodec,
			HasAudio:    cam.HasAudio,
			Width:       cam.Width,
			Height:      cam.Height,
			RTSPURL:     cam.RTSPURL,
			CaptureType: cam.EffectiveCaptureType(),
		}, prober, slog)

		// Persiste os dados detectados pelo ffprobe no banco.
		// Só atualiza quando ffprobe detectou dimensões reais (Width > 0) e a câmera
		// ainda não tem dimensões salvas — evita gravar fallbacks de falha no banco.
		if database != nil && stream.Width > 0 && cam.Width == 0 {
			if err := db.UpdateCameraStreamInfo(database, cam.ID, stream.VideoCodec, &stream.HasAudio, stream.Width, stream.Height); err != nil {
				slog.Warn("failed to persist stream info", "camera", cam.ID, "error", err)
			}
		}

		camCtx, camCancel := context.WithCancel(ctx)
		reconnect := cam.EffectiveReconnectInterval()

		if cam.RecordingEnabled {
			rec := recorder.NewRecorder(cam, cfg.Storage, stream, commander, slog)
			wg.Add(1)
			go func() {
				defer wg.Done()
				rec.Run(camCtx, reconnect)
			}()
		}

		if cfg.Server.SegmentsPath != "" {
			// The HLS pipeline runs unless the camera is set to WebRTC-only and can
			// actually use it (H.264) — that camera stops writing .ts entirely.
			if webrtc.ShouldRunHLS(stream.VideoCodec, cam.EffectiveLiveTransport(), cam.EffectiveCaptureType(), cam.LiveEnabled) {
				str := hls.NewHLSStreamer(cam, cfg.Server, stream, commander, slog)
				wg.Add(1)
				go func() {
					defer wg.Done()
					str.Run(camCtx, reconnect)
				}()
			} else if err := os.RemoveAll(filepath.Join(cfg.Server.SegmentsPath, cam.ID)); err != nil {
				slog.Warn("failed to remove stale hls segments", "camera", cam.ID, "error", err)
			}
		}

		// Low-latency live via WebRTC: only cameras that deliver H.264 can be
		// repackaged without transcoding, and the per-camera live_transport=hls
		// preference forces HLS by skipping the publisher. Cameras without a
		// publisher make the front fall back to HLS. Uses the main RTSP URL.
		if webrtc.ShouldPublish(stream.VideoCodec, cam.EffectiveLiveTransport(), cam.EffectiveCaptureType(), cam.LiveEnabled) {
			audioFmt, err := webrtc.ProbeAudio(camCtx, cam.RTSPURL)
			if err != nil {
				slog.Warn("live: audio probe failed, continuing without audio", "camera", cam.ID, "error", err)
			}
			// G.711 is repackaged as-is (RTSPAudioSource, zero CPU); anything
			// else (AAC and friends — the common case on IP cameras) needs a
			// real transcode to Opus (TranscodeAudioSource, spawns ffmpeg) for
			// WebRTC browsers to play it at all.
			var audioSource webrtc.Source
			switch {
			case audioFmt.Present && audioFmt.Transcode:
				audioSource = webrtc.NewTranscodeAudioSource(cam.RTSPURL, commander, slog)
			case audioFmt.Present:
				audioSource = webrtc.NewRTSPAudioSource(cam.RTSPURL, slog)
			}
			pub, err := webrtc.NewPublisher(cam.ID, webrtc.NewRTSPSource(cam.RTSPURL, slog), audioSource, audioFmt, slog)
			if err != nil {
				slog.Error("live: failed to create webrtc publisher", "camera", cam.ID, "error", err)
			} else {
				wg.Add(1)
				go func() {
					defer wg.Done()
					pub.Run(camCtx, reconnect)
				}()
				camMu.Lock()
				livePubsByID[cam.ID] = pub
				camMu.Unlock()
				if srv != nil {
					srv.WithLivePublisher(cam.ID, pub)
				}
			}
		}

		motionCfg := cam.EffectiveMotionConfig()
		if motionCfg.Enabled {
			camID := cam.ID
			// Motion may read a different stream than recorder/HLS (e.g. a lighter
			// substream). When it does, probe that URL so the pipe/snapshot use its
			// real dimensions instead of the main stream's.
			motionStream := stream
			if murl := cam.EffectiveMotionURL(); murl != cam.RTSPURL {
				motionStream = ffprobe.Resolve(context.Background(), ffprobe.Resolver{RTSPURL: murl, CaptureType: cam.EffectiveCaptureType()}, prober, slog)
			}
			mon := motion.New(cam, motionStream, motionCfg, cfg.Storage.Path, reconnect, slog,
				func() []zones.Zone {
					zs, _ := db.GetZones(database, camID)
					return zs
				},
				onMotionEvent)
			wg.Add(1)
			go func() {
				defer wg.Done()
				mon.Run(camCtx)
			}()

			camMu.Lock()
			motionMonsByID[cam.ID] = mon
			camMu.Unlock()

			if srv != nil {
				srv.WithMotionFeed(cam.ID, mon.Events())
				srv.WithRawFeed(cam.ID, mon.RawScores())
				srv.WithMonitor(cam.ID, mon)
			}
		}

		camMu.Lock()
		cancelsByID[cam.ID] = camCancel
		streamsByID[cam.ID] = stream
		camMu.Unlock()
	}

	stopCameraProcs := func(id string) {
		camMu.Lock()
		cancel := cancelsByID[id]
		delete(cancelsByID, id)
		delete(motionMonsByID, id)
		delete(streamsByID, id)
		delete(livePubsByID, id)
		camMu.Unlock()

		if cancel != nil {
			cancel()
		}
	}

	for _, cam := range cameras {
		startCameraProcs(cam)
	}

	if cfg.Server.Port > 0 {
		if cfg.Server.RecordingsPath == "" {
			cfg.Server.RecordingsPath = cfg.Storage.Path
		}
		static, err := fs.Sub(frontend.FS, "dist")
		if err != nil {
			log.Fatalf("failed to sub frontend fs: %v", err)
		}
		srv = server.NewServer(cfg.Server, cfg.Timezone, cameras, slog, static).
			WithStorageConfig(cfg.Storage).
			WithVersion(version).
			WithBuildInfo(commit, builtAt).
			WithSystemConfig(cfg.Debug, cfg.Log).
			WithExtensionsConfig(cfg.Extensions).
			WithSnapshotter(takeSnapshot).
			WithFrameExtractor(extractFrame).
			WithCameraCallbacks(startCameraProcs, stopCameraProcs).
			WithDB(database).
			WithProber(prober)
		var smtpSender *email.SMTPSender
		if cfg.SMTP.Host != "" {
			smtpSender = email.NewSMTPSender(cfg.SMTP)
			srv.WithEmailSender(smtpSender)
		}
		// telegramClient is shared by the notifications.Sender below and the
		// account-linking poller further down — one bot, one set of HTTP calls.
		var telegramClient *telegram.Client
		if cfg.Extensions.Telegram.Enabled && cfg.Extensions.Telegram.BotToken != "" {
			telegramClient = telegram.NewClient(cfg.Extensions.Telegram.BotToken)
		}
		if database != nil {
			senders := []notifications.Sender{application.New(database, srv)}
			if smtpSender != nil {
				senders = append(senders, notifyemail.New(database, smtpSender))
			}
			dispatcher = notifications.NewDispatcher(slog, senders...)
			srv.WithNotifications(dispatcher)
			// Canal Telegram DEDICADO pra NotifyCameraMotion — nunca entra na
			// lista `senders` acima: o Dispatcher genérico faz fan-out pra
			// todos os senders, inclusive o sino/página "Notificações" in-app
			// (application.New, sempre ativo, sem opt-in), o que nunca foi
			// pedido pra eventos de movimento (ver telegramSender em
			// internal/server/server.go).
			if telegramClient != nil {
				srv.WithTelegramSender(telegramnotify.New(database, telegramClient))
			}
		}

		// Telegram account-linking poller — independent of the runtime "Active"
		// toggle (Preferências > Extensões, only gates the UI): it just needs
		// the bot token configured to be able to resolve /start <code> from
		// anyone who opens the deep-link. Long-polling (not a webhook) since
		// this instance typically runs self-hosted behind NAT, without a
		// guaranteed public HTTPS endpoint.
		if database != nil && telegramClient != nil {
			poller := telegram.NewPoller(telegramClient, telegramLinkResolver{database}, srv)
			wg.Add(1)
			go func() {
				defer wg.Done()
				poller.Run(ctx, slog, 5*time.Second)
			}()
		}

		camMu.Lock()
		for id, si := range streamsByID {
			srv.WithStreamInfo(id, si)
		}
		for id, mon := range motionMonsByID {
			srv.WithMotionFeed(id, mon.Events())
			srv.WithRawFeed(id, mon.RawScores())
			srv.WithMonitor(id, mon)
		}
		for id, pub := range livePubsByID {
			srv.WithLivePublisher(id, pub)
		}
		camMu.Unlock()

		// Backfill device info for cameras registered before the feature
		// existed (best-effort, in the background so boot is not blocked).
		go srv.CaptureMissingDeviceInfo(context.Background())

		addr := fmt.Sprintf(":%d", cfg.Server.Port)
		slog.Info("http server starting", "addr", addr)
		go func() {
			if err := http.ListenAndServe(addr, srv); err != nil {
				slog.Error("http server error", "error", err)
			}
		}()
		printStartupURLs(cfg.Server.Port)
	}

	storageCfg := db.StorageSettingsFromDB(database)
	cleanInterval := time.Duration(storageCfg.IntervalMinutes) * time.Minute
	if cleanInterval == 0 {
		cleanInterval = time.Hour
	}
	// A câmera pode subir sem HTTP server (cfg.Server.Port<=0), caso em que o
	// dispatcher acima nunca foi construído — o Cleaner ainda precisa de um
	// (sem live push, já que não há srv/notifHub pra isso).
	if dispatcher == nil && database != nil {
		dispatcher = notifications.NewDispatcher(slog, application.New(database, nil))
	}
	cleaner := storage.New(
		cfg.Storage.Path,
		storageCfg.WithMotionMinutes,
		storageCfg.WithoutMotionMinutes,
		config.DefaultChunkDuration,
		storageCfg.MaxSizeGB,
		storageCfg.WarnPercent,
		database,
		slog,
	).WithNotifications(dispatcher)
	if srv != nil {
		srv.WithCleaner(cleaner)

		updateChecker := release.NewChecker(release.DefaultManifestURL, version, nil)
		updateChecker.OnCheck = srv.NotifyUpdateAvailable
		srv.WithUpdateChecker(updateChecker)
		go updateChecker.Run(ctx, 6*time.Hour)

		srv.WithReleaseNotesFetcher(release.NewNotesFetcher(nil))

		updEnv := updater.Detect(exe)
		srv.WithApplyMode(updEnv.ApplyMode)
		slog.Info("update environment detected", "apply_mode", updEnv.ApplyMode, "in_docker", updEnv.InDocker, "binary_writable", updEnv.BinaryWritable)

		srv.WithApplier(&updater.Applier{
			Dir: binDir, Target: exe, BaseURL: release.DefaultDownloadBase,
			DBPath: dbPath, CurrentVersion: version,
			Download: func(ctx context.Context, url, sha, dest string) error {
				return updater.Download(ctx, nil, url, sha, dest)
			},
			Snapshot: func() (string, error) {
				return dbbackup.Snapshot(dbPath, filepath.Join(dbDir, "backups"), version)
			},
			Replace: updater.Replace,
			Reexec:  updater.ReexecSelf,
		})

		// Confirma o trial de update (limpa o marcador) após o boot ficar saudável.
		if inTrial {
			go func() {
				time.Sleep(30 * time.Second)
				if err := updater.ClearMarker(binDir); err != nil {
					slog.Warn("could not clear update marker after trial", "error", err)
				} else {
					slog.Info("update confirmed")
				}
			}()
		}
	}
	go cleaner.Run(ctx, cleanInterval)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	cancel()

	slog.Info("shutting down, finalizing chunks...")
	wg.Wait()
	slog.Info("done")
}

// telegramLinkResolver adapts internal/db's telegram.go functions to
// telegram.LinkResolver (interface defined consumer-side, in the telegram
// package itself — this is just the db-backed implementation main.go wires
// in).
type telegramLinkResolver struct {
	db *db.DB
}

func (r telegramLinkResolver) ResolveLinkCode(code string) (int64, bool) {
	userID, err := db.FindUserByTelegramLinkCode(r.db, code)
	if err != nil {
		return 0, false
	}
	return userID, true
}

func (r telegramLinkResolver) SetChatInfo(userID int64, chatID, username, firstName, lastName string) error {
	return db.SetUserTelegramChatInfo(r.db, userID, chatID, username, firstName, lastName)
}

func (r telegramLinkResolver) ClearLinkCode(userID int64) error {
	return db.ClearTelegramLinkCode(r.db, userID)
}

func printStartupURLs(port int) {
	urls := []string{fmt.Sprintf("http://localhost:%d", port)}
	ifaces, err := net.InterfaceAddrs()
	if err == nil {
		seen := map[string]bool{}
		for _, addr := range ifaces {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() {
				continue
			}
			if ip4 := ip.To4(); ip4 != nil {
				u := fmt.Sprintf("http://%s:%d", ip4, port)
				if !seen[u] {
					seen[u] = true
					urls = append(urls, u)
				}
			}
		}
	}
	fmt.Println()
	fmt.Println("┌─────────────────────────────────────────┐")
	fmt.Println("│  Camera iniciado. Acesse pelo navegador:│")
	for _, u := range urls {
		fmt.Printf("│  %-39s│\n", u)
	}
	fmt.Println("└─────────────────────────────────────────┘")
	fmt.Println()
}

func takeSnapshot(ctx context.Context, rtspURL, captureType string) ([]byte, error) {
	return core.Snapshot(ctx, rtspURL, captureType, core.OSExecutor{})
}

// extractFrame extrai um frame LIMPO (JPEG) de um MP4 no offset dado — a gravação
// não tem as anotações de movimento dos _motion.jpg. `-ss` antes do `-i` faz seek
// rápido por keyframe.
//
// `offsetSeconds` vem de `findChunkForTime`, que não conhece a duração REAL do chunk
// (só o horário de início) — um bucket da timeline de 24h cobre uma janela fixa (5 min
// por padrão) mesmo quando a gravação coberta por ele dura só alguns segundos, então
// qualquer ponto do bucket depois do fim real do chunk pede um offset além da duração
// do arquivo. `-ss` além do fim não é erro de argumento: o ffmpeg roda, não encontra
// frame nenhum e sai com "Output file is empty" (frame=0, stdout vazio) — reproduzido
// manualmente com um MP4 de teste. Sem fallback, isso virava "frame extraction failed"
// toda vez que o usuário passava o mouse num trecho do heatmap mais largo que a
// gravação real por baixo (comum: qualquer chunk com menos de 5 min). Reexecuta com
// `-sseof -1` (1s antes do fim do arquivo, sem depender de conhecer a duração) só
// quando a 1ª tentativa não produz nenhum byte — dá o último frame disponível em vez
// de falhar; hover MUITO além do fim real (chunk antigo, gap grande) ainda mostra algo
// coerente (o fim daquele chunk) em vez de nada.
func extractFrame(ctx context.Context, path string, offsetSeconds float64) ([]byte, error) {
	data, err := runExtractFrame(ctx, "-ss", fmt.Sprintf("%.3f", offsetSeconds), path)
	if err == nil && len(data) > 0 {
		return data, nil
	}
	return runExtractFrame(ctx, "-sseof", "-1", path)
}

func runExtractFrame(ctx context.Context, seekFlag, seekValue, path string) ([]byte, error) {
	cmd := osexec.CommandContext(ctx,
		"ffmpeg",
		seekFlag, seekValue,
		"-i", path,
		"-frames:v", "1",
		"-f", "image2",
		"-vcodec", "mjpeg",
		"-",
	)
	return cmd.Output()
}
