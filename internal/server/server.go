package server

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/deviceinfo"
	"camera/internal/ffprobe"
	"camera/internal/motion"
	"camera/internal/release"
	"camera/internal/storage"
	"camera/internal/zones"
)

type contextKey int

const claimsKey contextKey = 0

type authClaims struct {
	UserID             int64
	Role               string
	MustChangePassword bool
}

type broadcaster struct {
	mu   sync.Mutex
	subs map[chan motion.Event]struct{}
	done bool
}

func newBroadcaster() *broadcaster {
	return &broadcaster{subs: make(map[chan motion.Event]struct{})}
}

func (b *broadcaster) subscribe() chan motion.Event {
	ch := make(chan motion.Event, 16)
	b.mu.Lock()
	if b.done {
		b.mu.Unlock()
		close(ch)
		return ch
	}
	b.subs[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

func (b *broadcaster) unsubscribe(ch chan motion.Event) {
	b.mu.Lock()
	delete(b.subs, ch)
	b.mu.Unlock()
}

func (b *broadcaster) run(src <-chan motion.Event) {
	for ev := range src {
		b.mu.Lock()
		for ch := range b.subs {
			select {
			case ch <- ev:
			default:
			}
		}
		b.mu.Unlock()
	}
	b.mu.Lock()
	for ch := range b.subs {
		close(ch)
	}
	b.subs = make(map[chan motion.Event]struct{})
	b.done = true
	b.mu.Unlock()
}

type Server struct {
	cfg                 config.ServerConfig
	storageCfg          config.StorageConfig
	logCfg              config.LogConfig
	debug               bool
	timezone            string
	version             string
	commit              string
	builtAt             string
	startTime           time.Time
	cameras             []config.CameraConfig
	log                 *slog.Logger
	secret              []byte
	frontend            fs.FS
	mux                 *http.ServeMux
	mu                  sync.Mutex
	streamSeen          map[string]time.Time
	motionBroadcasters  map[string]*broadcaster
	rawBroadcasters     map[string]*broadcaster
	notifHub            *notifHub
	peakMu              sync.RWMutex
	dailyPeakRaw        map[string]float64
	dailyPeakDate       map[string]string
	snapFn              func(ctx context.Context, rtspURL string) ([]byte, error)
	frameFn             func(ctx context.Context, path string, offsetSeconds float64) ([]byte, error)
	probedStreams       map[string]ffprobe.StreamInfo
	db                  *db.DB
	prober              *ffprobe.Prober
	onCameraStart       func(config.CameraConfig)
	onCameraStop        func(string)
	monitors            map[string]*motion.Monitor
	livePublishers      map[string]livePublisher
	cpu                 cpuTracker
	net                 netTracker
	cleaner             interface{ ForceClean() }
	deviceCollectors    []deviceinfo.Collector
	updateChecker       updateStatuser
	releaseNotesFetcher releaseNotesFetcher
	applyMode           string
	applier             applyRunner
	updateNotifyMu      sync.Mutex
	updateNotified      string // última versão latest já notificada (dedup)
	emailSender         emailSender
}

// emailSender envia e-mail (esqueci-a-senha hoje). Definido aqui no
// consumidor para manter o acoplamento mínimo — a implementação real vive em
// internal/email (Sender).
type emailSender interface {
	Send(to, subject, body string) error
}

// updateStatuser fornece o snapshot da checagem de versão e o manifesto cacheado
// (consumidos por handleUpdates/handleApplyUpdate). Definido aqui no consumidor
// para manter o acoplamento mínimo.
type updateStatuser interface {
	Status() release.Status
	Manifest() (release.Manifest, bool)
}

// releaseNotesFetcher busca o changelog da release do GitHub correspondente a
// uma versão exata (ao contrário de updateStatuser, que só enxerga a "latest"
// — a API do GitHub nunca resolve pré-releases como latest, então uma RC
// rodando não teria como mostrar suas próprias notas via updateStatuser).
// Consumido por handleAbout.
type releaseNotesFetcher interface {
	Notes(ctx context.Context, version string) (string, error)
}

// applyRunner aplica uma atualização a partir de um manifesto.
type applyRunner interface {
	Apply(ctx context.Context, m release.Manifest) error
}

func NewServer(cfg config.ServerConfig, timezone string, cameras []config.CameraConfig, log *slog.Logger, frontend fs.FS) *Server {
	var secret []byte
	if cfg.JWTSecret != "" {
		secret = []byte(cfg.JWTSecret)
	} else {
		secret = make([]byte, 32)
		rand.Read(secret)
	}

	s := &Server{
		cfg:           cfg,
		timezone:      timezone,
		cameras:       cameras,
		log:           log,
		secret:        secret,
		frontend:      frontend,
		mux:           http.NewServeMux(),
		streamSeen:    make(map[string]time.Time),
		probedStreams: make(map[string]ffprobe.StreamInfo),
		startTime:     time.Now(),
		notifHub:      newNotifHub(),
	}
	s.routes()
	return s
}

func (s *Server) WithDB(database *db.DB) *Server {
	s.db = database
	return s
}

// WithEmailSender wires the e-mail sender used for password-reset (and any
// future outbound e-mail). Without it, handleForgotPassword no-ops (no SMTP
// configured — see internal/config.SMTPConfig).
func (s *Server) WithEmailSender(sender emailSender) *Server {
	s.emailSender = sender
	return s
}

func (s *Server) WithCameraCallbacks(start func(config.CameraConfig), stop func(string)) *Server {
	s.onCameraStart = start
	s.onCameraStop = stop
	return s
}

func (s *Server) WithStorageConfig(cfg config.StorageConfig) *Server {
	s.storageCfg = cfg
	return s
}

func (s *Server) WithStreamInfo(id string, info ffprobe.StreamInfo) *Server {
	s.probedStreams[id] = info
	return s
}

func (s *Server) WithProber(p *ffprobe.Prober) *Server {
	s.prober = p
	return s
}

func (s *Server) WithVersion(v string) *Server {
	s.version = v
	return s
}

func (s *Server) WithBuildInfo(commit, builtAt string) *Server {
	s.commit = commit
	s.builtAt = builtAt
	return s
}

func (s *Server) WithCleaner(c interface{ ForceClean() }) *Server {
	s.cleaner = c
	return s
}

func (s *Server) WithUpdateChecker(c updateStatuser) *Server {
	s.updateChecker = c
	return s
}

func (s *Server) WithReleaseNotesFetcher(f releaseNotesFetcher) *Server {
	s.releaseNotesFetcher = f
	return s
}

func (s *Server) WithApplyMode(mode string) *Server {
	s.applyMode = mode
	return s
}

func (s *Server) WithApplier(a applyRunner) *Server {
	s.applier = a
	return s
}

func (s *Server) WithSystemConfig(debug bool, logCfg config.LogConfig) *Server {
	s.debug = debug
	s.logCfg = logCfg
	return s
}

func (s *Server) WithMotionFeed(cameraID string, events <-chan motion.Event) *Server {
	bc := newBroadcaster()
	s.mu.Lock()
	if s.motionBroadcasters == nil {
		s.motionBroadcasters = make(map[string]*broadcaster)
	}
	s.motionBroadcasters[cameraID] = bc
	s.mu.Unlock()
	go bc.run(events)
	return s
}

func (s *Server) WithSnapshotter(fn func(ctx context.Context, rtspURL string) ([]byte, error)) *Server {
	s.snapFn = fn
	return s
}

func (s *Server) WithFrameExtractor(fn func(ctx context.Context, path string, offsetSeconds float64) ([]byte, error)) *Server {
	s.frameFn = fn
	return s
}

func (s *Server) WithMonitor(cameraID string, m *motion.Monitor) *Server {
	s.mu.Lock()
	if s.monitors == nil {
		s.monitors = make(map[string]*motion.Monitor)
	}
	s.monitors[cameraID] = m
	s.mu.Unlock()
	return s
}

func (s *Server) WithRawFeed(cameraID string, events <-chan motion.Event) *Server {
	bc := newBroadcaster()
	s.mu.Lock()
	if s.rawBroadcasters == nil {
		s.rawBroadcasters = make(map[string]*broadcaster)
	}
	s.rawBroadcasters[cameraID] = bc
	s.mu.Unlock()

	tee := make(chan motion.Event, 256)
	go func() {
		defer close(tee)
		for ev := range events {
			s.updateDailyPeak(cameraID, ev)
			tee <- ev
		}
	}()
	go bc.run(tee)
	return s
}

func (s *Server) updateDailyPeak(cameraID string, ev motion.Event) {
	today := ev.Time.UTC().Format("2006-01-02")
	s.peakMu.Lock()
	defer s.peakMu.Unlock()
	if s.dailyPeakRaw == nil {
		s.dailyPeakRaw = make(map[string]float64)
		s.dailyPeakDate = make(map[string]string)
	}
	if s.dailyPeakDate[cameraID] != today {
		s.dailyPeakRaw[cameraID] = ev.Score
		s.dailyPeakDate[cameraID] = today
	} else if ev.Score > s.dailyPeakRaw[cameraID] {
		s.dailyPeakRaw[cameraID] = ev.Score
	}
}

// CORS liberado em /api/*: a autenticação é sempre bearer token explícito
// (header ou ?token=, nunca cookie), então não há superfície de CSRF — um
// site de terceiros não consegue anexar automaticamente o token do usuário.
// Um cliente externo hospedado em outro origin precisa desses headers pra
// sequer conseguir chamar POST /api/auth/login. /stream/, /recordings/ e a
// SPA continuam same-origin only.
func setCORSHeaders(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		setCORSHeaders(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}

	lw := &loggingResponseWriter{ResponseWriter: w, code: http.StatusOK}
	start := time.Now()
	s.mux.ServeHTTP(lw, r)
	s.logRequest(r, lw.code, time.Since(start))
}

func (s *Server) routes() {
	for _, rt := range s.routeTable() {
		s.mux.HandleFunc(rt.method+" "+rt.path, s.guard(rt))
	}

	streamHandler := http.StripPrefix("/stream/", noCachePlaylist(http.FileServer(http.Dir(s.cfg.SegmentsPath))))
	s.mux.Handle("/stream/", s.requireStreamAccess(streamHandler))

	recHandler := http.StripPrefix("/recordings/", http.FileServer(http.Dir(s.cfg.RecordingsPath)))
	s.mux.Handle("/recordings/", s.recordingsOrSPA(recHandler))

	if s.frontend != nil {
		// Rota exata da SPA pro caso zero-segmentos: sem ela, GET /recordings (sem barra) é
		// redirecionado pelo mux pra /recordings/ ANTES de recordingsOrSPA decidir — um hop
		// a mais evitável (o resultado final seria o mesmo, recordingsOrSPA trata parts[0]=""
		// como SPA). match exato vence o subtree e serve o index.html direto, sem o redirect.
		s.mux.Handle("GET /recordings", s.spaHandler())
		s.mux.Handle("/", s.spaHandler())
	}

}

func (s *Server) spaHandler() http.Handler {
	fileServer := http.FileServer(http.FS(s.frontend))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Strip leading "/" to form a valid fs.FS path
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name == "" {
			name = "index.html"
		}
		if _, err := fs.Stat(s.frontend, name); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}
		// Unknown path: serve index.html for client-side routing
		data, err := fs.ReadFile(s.frontend, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	})
}

// requireFullAuth wraps requireAuth and additionally rejects tokens that have
// must_change_password=true. Only /api/auth/change-password is exempt.
func (s *Server) requireFullAuth(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		ac, _ := r.Context().Value(claimsKey).(authClaims)
		if ac.MustChangePassword {
			http.Error(w, "password change required", http.StatusForbidden)
			return
		}
		next(w, r)
	})
}

func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return s.requireFullAuth(func(w http.ResponseWriter, r *http.Request) {
		ac, _ := r.Context().Value(claimsKey).(authClaims)
		if ac.Role != "admin" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next(w, r)
	})
}

func (s *Server) canAccessCamera(r *http.Request, cameraID string) bool {
	ac, _ := r.Context().Value(claimsKey).(authClaims)
	if ac.Role == "admin" {
		return true
	}
	// Fail closed: a viewer's grants live in the DB, so without it there is no
	// way to authorize — deny rather than fall open.
	if s.db == nil {
		return false
	}
	ok, err := db.UserHasCamera(s.db, ac.UserID, cameraID)
	if err != nil {
		return false
	}
	return ok
}

func (s *Server) requireCameraAccess(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		if !s.canAccessCamera(r, r.PathValue("id")) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next(w, r)
	})
}

// noCachePlaylist prevents browsers from caching the HLS playlist. The
// playlist is served by a plain file server (only Last-Modified), which makes
// it heuristically cacheable — after a long stall the browser would keep
// replaying a frozen playlist from disk cache instead of revalidating. Segments
// (.ts) have unique, immutable names and stay cacheable.
func noCachePlaylist(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".m3u8") {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			w.Header().Set("Pragma", "no-cache")
			w.Header().Set("Expires", "0")
		}
		next.ServeHTTP(w, r)
	})
}

// requirePrefixCameraAccess gates a path-mounted file handler ("/stream/",
// "/recordings/") by the camera id in the first path segment after prefix.
func (s *Server) requirePrefixCameraAccess(prefix string, next http.Handler) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		// SplitN always returns at least one element, so parts[0] is safe.
		parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, prefix), "/", 2)
		if parts[0] == "" {
			http.NotFound(w, r)
			return
		}
		if !s.canAccessCamera(r, parts[0]) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requireStreamAccess(next http.Handler) http.HandlerFunc {
	return s.requirePrefixCameraAccess("/stream/", next)
}

func (s *Server) requireRecordingsAccess(next http.Handler) http.HandlerFunc {
	return s.requirePrefixCameraAccess("/recordings/", next)
}

// recordingsSpecialSegments — namespaces sob /recordings/ que NÃO são um id de câmera mas
// ainda são arquivo de verdade (gated), não rota da SPA: thumbnails/amostras de state
// classification, servidos sob o mesmo prefixo por conveniência (storage compartilhado).
// state_train fica de fora de propósito — usado só internamente pelo container YOLO via
// volume compartilhado, nunca servido por HTTP pro browser. Ver internal/stateengine/
// history.go (state_history) e samples.go (state_samples) pra onde essas URLs nascem.
var recordingsSpecialSegments = map[string]bool{
	"state_history": true,
	"state_samples": true,
}

// recordingsOrSPA distingue uma requisição de ARQUIVO real (1º segmento = câmera que existe,
// ou um dos namespaces especiais em recordingsSpecialSegments) de uma rota de página da SPA
// sob o mesmo prefixo /recordings/ (RecordingsPage: data, hora, view — qualquer profundidade,
// com ou sem barra final): a auth só se aplica ao primeiro caso; o segundo é sempre servido
// como a SPA — estático (index.html), sem precisar de auth aqui, já que o RequireAuth do React
// cuida da página depois de carregada, igual toda outra rota protegida do app. Datas (ex.
// "2026-07-27") nunca colidem com um ID de câmera nem com os namespaces especiais, então
// qualquer profundidade cai pra SPA automaticamente, sem precisar registrar uma rota exata por
// formato (a abordagem anterior — rotas exatas por profundidade — não generalizava: uma barra
// final depois da data, ou uma profundidade futura nova, escapava e caía de volta no gate;
// achado real do navigator testando /recordings/2026-07-27/). REGRESSÃO real já causada por
// esta função antes do allowlist existir: state_history/state_samples nunca batem com uma
// câmera, então caíam pra SPA (servindo o index.html em vez do JPEG — thumbnails quebradas em
// RecordingsPage/CameraStatesSettingsPage).
func (s *Server) recordingsOrSPA(fileHandler http.Handler) http.HandlerFunc {
	gated := s.requireRecordingsAccess(fileHandler)
	return func(w http.ResponseWriter, r *http.Request) {
		parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/recordings/"), "/", 2)
		if parts[0] != "" && (s.cameraExists(parts[0]) || recordingsSpecialSegments[parts[0]]) {
			gated(w, r)
			return
		}
		if s.frontend != nil {
			s.spaHandler().ServeHTTP(w, r)
			return
		}
		http.NotFound(w, r)
	}
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenStr := ""
		if h := r.Header.Get("Authorization"); len(h) > 7 && h[:7] == "Bearer " {
			tokenStr = h[7:]
		} else if q := r.URL.Query().Get("token"); q != "" {
			tokenStr = q
		}
		if tokenStr == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		parsed, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return s.secret, nil
		})
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		// A signature-valid token must still carry a usable identity. Reject
		// (rather than silently degrade to a zero-value, anonymous-but-
		// authenticated principal) when user_id/role are absent or unusable.
		claims, ok := parsed.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		uid, uidOK := claims["user_id"].(float64)
		roleStr, roleOK := claims["role"].(string)
		if !uidOK || int64(uid) <= 0 || !roleOK || roleStr == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ac := authClaims{UserID: int64(uid), Role: roleStr}
		if mcp, ok := claims["must_change_password"].(bool); ok {
			ac.MustChangePassword = mcp
		}
		r = r.WithContext(context.WithValue(r.Context(), claimsKey, ac))
		if strings.HasPrefix(r.URL.Path, "/stream/") {
			s.touchStreamClient(r)
		}
		next(w, r)
	}
}

// clientIP extrai o IP do cliente a partir do request (X-Forwarded-For, senão RemoteAddr) —
// compartilhada por touchStreamClient (HLS) e handleWebRTC (sinalização), pra "conectados"
// contar a mesma coisa nos dois transportes.
func clientIP(r *http.Request) string {
	key := r.RemoteAddr
	if host := r.Header.Get("X-Forwarded-For"); host != "" {
		key = strings.TrimSpace(strings.Split(host, ",")[0])
	}
	if h, _, ok := strings.Cut(key, ":"); ok && h != "" {
		key = h
	}
	return key
}

func (s *Server) touchStreamClient(r *http.Request) {
	s.mu.Lock()
	s.streamSeen[clientIP(r)] = time.Now()
	s.mu.Unlock()
}

// activeStreamClients conta IPs distintos com atividade recente — soma HLS (streamSeen, janela
// de 30s por trás do polling contínuo) e WebRTC (ConnectedIPs de cada publisher, preciso via
// OnConnectionStateChange, sem heurística de timeout) num único set deduplicado, pra um mesmo
// IP assistindo por transportes diferentes ao mesmo tempo contar só 1 vez.
func (s *Server) activeStreamClients(now time.Time) int {
	const activeWindow = 30 * time.Second
	cutoff := now.Add(-activeWindow)
	s.mu.Lock()
	ips := make(map[string]struct{}, len(s.streamSeen))
	for k, seen := range s.streamSeen {
		if seen.Before(cutoff) {
			delete(s.streamSeen, k)
			continue
		}
		ips[k] = struct{}{}
	}
	publishers := make([]livePublisher, 0, len(s.livePublishers))
	for _, pub := range s.livePublishers {
		publishers = append(publishers, pub)
	}
	s.mu.Unlock()
	for _, pub := range publishers {
		for _, ip := range pub.ConnectedIPs() {
			ips[ip] = struct{}{}
		}
	}
	return len(ips)
}

func maskRTSP(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.User == nil {
		return raw
	}
	return u.Redacted()
}

func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	type motionDTO struct {
		Enabled              bool    `json:"enabled"`
		Threshold            float64 `json:"threshold"`
		FPS                  int     `json:"fps"`
		CooldownSeconds      int     `json:"cooldown_seconds"`
		CaptureWidth         int     `json:"capture_width,omitempty"`
		CaptureHeight        int     `json:"capture_height,omitempty"`
		PlaybackLeadSeconds  int     `json:"playback_lead_seconds"`
		PlaybackTrailSeconds int     `json:"playback_trail_seconds"`
	}
	type cameraDTO struct {
		ID                string     `json:"id"`
		Name              string     `json:"name"`
		RTSPURL           string     `json:"rtsp_url"`
		MotionRTSPURL     string     `json:"motion_rtsp_url,omitempty"`
		ChunkDuration     string     `json:"chunk_duration"`
		ReconnectInterval string     `json:"reconnect_interval"`
		VideoCodec        string     `json:"video_codec"`
		HasAudio          *bool      `json:"has_audio"`
		Width             int        `json:"width"`
		Height            int        `json:"height"`
		HLSVideoMode      string     `json:"hls_video_mode"`
		RecordVideoMode   string     `json:"record_video_mode"`
		LiveTransport     string     `json:"live_transport"`
		HLSSegmentSeconds *int       `json:"hls_segment_seconds"`
		HLSListSize       *int       `json:"hls_list_size"`
		HLSDVRSeconds     *int       `json:"hls_dvr_seconds"`
		RecordingEnabled  bool       `json:"recording_enabled"`
		Motion            *motionDTO `json:"motion"`
	}
	camList := s.cameras
	if s.db != nil {
		if all, err := db.ListCameras(s.db); err == nil {
			camList = all
		}
	}
	cameras := make([]cameraDTO, len(camList))
	for i, c := range camList {
		var motion *motionDTO
		if c.Motion != nil {
			motion = &motionDTO{
				Enabled:              c.Motion.Enabled,
				Threshold:            c.Motion.Threshold,
				FPS:                  c.Motion.FPS,
				CooldownSeconds:      c.Motion.CooldownSeconds,
				CaptureWidth:         c.Motion.CaptureWidth,
				CaptureHeight:        c.Motion.CaptureHeight,
				PlaybackLeadSeconds:  c.Motion.PlaybackLeadSeconds,
				PlaybackTrailSeconds: c.Motion.PlaybackTrailSeconds,
			}
		}
		videoCodec := c.VideoCodec
		hasAudio := c.HasAudio
		width, height := c.Width, c.Height
		if probed, ok := s.probedStreams[c.ID]; ok {
			if videoCodec == "" {
				videoCodec = probed.VideoCodec
			}
			if hasAudio == nil {
				ha := probed.HasAudio
				hasAudio = &ha
			}
			if width == 0 {
				width = probed.Width
				height = probed.Height
			}
		}
		cameras[i] = cameraDTO{
			ID:                c.ID,
			Name:              c.Name,
			RTSPURL:           maskRTSP(c.RTSPURL),
			MotionRTSPURL:     maskRTSP(c.MotionRTSPURL),
			ChunkDuration:     formatDuration(c.EffectiveChunkDuration()),
			ReconnectInterval: formatDuration(c.EffectiveReconnectInterval()),
			VideoCodec:        videoCodec,
			HasAudio:          hasAudio,
			Width:             width,
			Height:            height,
			HLSVideoMode:      c.HLSVideoMode,
			RecordVideoMode:   c.RecordVideoMode,
			LiveTransport:     c.EffectiveLiveTransport(),
			HLSSegmentSeconds: c.HLSSegmentSeconds,
			HLSListSize:       c.HLSListSize,
			HLSDVRSeconds:     c.HLSDVRSeconds,
			RecordingEnabled:  c.RecordingEnabled,
			Motion:            motion,
		}
	}
	resp := map[string]any{
		"timezone": s.timezone,
		"debug":    s.debug,
		"log": map[string]any{
			"output":       s.logCfg.Output,
			"path":         s.logCfg.Path,
			"max_size_mb":  s.logCfg.MaxSizeMBOrDefault(),
			"max_age_days": s.logCfg.MaxAgeDaysOrDefault(),
			"max_backups":  s.logCfg.MaxBackupsOrDefault(),
			"compress":     s.logCfg.CompressOrDefault(),
		},
		"server": map[string]any{
			"port":            s.cfg.Port,
			"segments_path":   s.cfg.SegmentsPath,
			"recordings_path": s.cfg.RecordingsPath,
		},
		"storage": func() map[string]any {
			wm, wom, interval, maxGB, warnPct, stateHistory := s.effectiveStorageSettings()
			return map[string]any{
				"path":                   s.storageCfg.Path,
				"with_motion_minutes":    wm,
				"without_motion_minutes": wom,
				"interval_minutes":       interval,
				"max_size_gb":            maxGB,
				"warn_percent":           warnPct,
				"state_history_minutes":  stateHistory,
			}
		}(),
		"defaults": map[string]any{
			"chunk_duration":     formatDuration(config.DefaultChunkDuration),
			"reconnect_interval": formatDuration(config.DefaultReconnectInterval),
		},
		"cameras": cameras,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleAbout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	resp := map[string]any{
		"version":        s.version,
		"commit":         s.commit,
		"built_at":       s.builtAt,
		"uptime_seconds": time.Since(s.startTime).Seconds(),
		"go_version":     runtime.Version(),
	}
	// Notas da release do GitHub que corresponde EXATAMENTE à versão instalada
	// (não a "latest" do updateStatuser — releases/latest da API do GitHub nunca
	// resolve pré-releases, então uma RC rodando nunca apareceria por ali).
	// Ausentes (sem erro) quando não há release publicada pra essa versão exata
	// (build de dev) ou o fetcher não está configurado.
	if s.releaseNotesFetcher != nil {
		if notes, err := s.releaseNotesFetcher.Notes(r.Context(), s.version); err == nil && notes != "" {
			resp["release_notes_version"] = s.version
			resp["release_notes_md"] = notes
		}
	}
	json.NewEncoder(w).Encode(resp)
}

type updatesResponse struct {
	release.Status
	ApplyMode string `json:"apply_mode"`
}

func (s *Server) handleUpdates(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	st := release.Status{Current: s.version}
	if s.updateChecker != nil {
		st = s.updateChecker.Status()
	}
	json.NewEncoder(w).Encode(updatesResponse{Status: st, ApplyMode: s.applyMode})
}

func (s *Server) handleApplyUpdate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if s.applyMode != "self-replace" {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "apply indisponível no modo " + s.applyMode})
		return
	}
	if s.applier == nil || s.updateChecker == nil {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "atualização não disponível"})
		return
	}
	if !s.updateChecker.Status().UpdateAvailable {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "nenhuma atualização disponível"})
		return
	}
	manifest, ok := s.updateChecker.Manifest()
	if !ok {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "manifesto indisponível"})
		return
	}

	// Apply baixa, troca o binário e re-executa (não retorna). Responde antes e
	// roda em background para que a resposta saia.
	go func() {
		if err := s.applier.Apply(context.Background(), manifest); err != nil {
			s.log.Error("apply update failed", "error", err)
		}
	}()

	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"status": "applying", "to": manifest.Latest})
}

func (s *Server) handleClientConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"timezone": s.timezone, "version": s.version})
}

func (s *Server) handleCameras(w http.ResponseWriter, r *http.Request) {
	type motionInfo struct {
		Enabled         bool    `json:"enabled"`
		Threshold       float64 `json:"threshold"`
		FPS             int     `json:"fps"`
		CooldownSeconds int     `json:"cooldown_seconds"`
		CaptureWidth    int     `json:"capture_width,omitempty"`
		CaptureHeight   int     `json:"capture_height,omitempty"`
	}

	type cameraInfo struct {
		ID                   string      `json:"id"`
		Name                 string      `json:"name"`
		RecordingEnabled     bool        `json:"recording_enabled"`
		VideoCodec           string      `json:"video_codec,omitempty"`
		HasAudio             *bool       `json:"has_audio"`
		Width                int         `json:"width,omitempty"`
		Height               int         `json:"height,omitempty"`
		LiveTransport        string      `json:"live_transport"`
		Motion               *motionInfo `json:"motion"`
		MotionThreshold      float64     `json:"motion_threshold"`
		PlaybackLeadSeconds  int         `json:"playback_lead_seconds"`
		PlaybackTrailSeconds int         `json:"playback_trail_seconds"`
	}

	cameras := s.cameras
	if s.db != nil {
		all, err := db.ListCameras(s.db)
		if err == nil {
			cameras = all
		}
		ac, _ := r.Context().Value(claimsKey).(authClaims)
		if ac.Role != "admin" {
			allowed, err := db.GetUserCameras(s.db, ac.UserID)
			if err == nil {
				allowedSet := make(map[string]struct{}, len(allowed))
				for _, id := range allowed {
					allowedSet[id] = struct{}{}
				}
				var filtered []config.CameraConfig
				for _, c := range cameras {
					if _, ok := allowedSet[c.ID]; ok {
						filtered = append(filtered, c)
					}
				}
				cameras = filtered
			}
		}
	}

	list := make([]cameraInfo, len(cameras))
	for i, c := range cameras {
		mc := c.EffectiveMotionConfig()
		lead := 10
		if mc.PlaybackLeadSeconds > 0 {
			lead = mc.PlaybackLeadSeconds
		}
		trail := 10
		if mc.PlaybackTrailSeconds > 0 {
			trail = mc.PlaybackTrailSeconds
		}
		var motion *motionInfo
		if c.Motion != nil {
			motion = &motionInfo{
				Enabled:         mc.Enabled,
				Threshold:       mc.Threshold,
				FPS:             mc.FPS,
				CooldownSeconds: mc.CooldownSeconds,
				CaptureWidth:    mc.CaptureWidth,
				CaptureHeight:   mc.CaptureHeight,
			}
		}
		list[i] = cameraInfo{
			ID:                   c.ID,
			Name:                 c.Name,
			RecordingEnabled:     c.RecordingEnabled,
			VideoCodec:           c.VideoCodec,
			HasAudio:             c.HasAudio,
			Width:                c.Width,
			Height:               c.Height,
			LiveTransport:        c.EffectiveLiveTransport(),
			Motion:               motion,
			MotionThreshold:      mc.Threshold,
			PlaybackLeadSeconds:  lead,
			PlaybackTrailSeconds: trail,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func (s *Server) handleRecordings(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	dateStr := r.URL.Query().Get("date")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limitStr := r.URL.Query().Get("limit")
	limit, _ := strconv.Atoi(limitStr)
	// limit=0 explícito → sem cap (todas as gravações do dia); ausente/inválido → default 10.
	allRecs := limitStr != "" && limit <= 0
	order := r.URL.Query().Get("order")
	if order != "asc" {
		order = "desc"
	}
	if page < 1 {
		page = 1
	}
	if !allRecs && limit < 1 {
		limit = 10
	}

	loc, err := time.LoadLocation(s.timezone)
	if err != nil {
		loc = time.UTC
	}

	// Parse the requested date as a local day in the configured timezone.
	localDay, err := time.ParseInLocation("2006-01-02", dateStr, loc)
	if err != nil {
		http.Error(w, "invalid date", http.StatusBadRequest)
		return
	}
	// UTC range that covers the full local day.
	dayStart := localDay.UTC()
	dayEnd := localDay.Add(24 * time.Hour).UTC()

	// Collect UTC calendar days that overlap with this local day.
	utcDays := utcDaysInRange(dayStart, dayEnd)

	type recordingDetection struct {
		Label       string  `json:"label"`
		Confidence  float64 `json:"confidence"`
		FrameCount  int     `json:"frame_count"`
		CustomModel bool    `json:"custom_model,omitempty"`
	}
	type recording struct {
		ID          int64                `json:"id,omitempty"`
		Filename    string               `json:"filename"`
		Start       string               `json:"start"`
		End         string               `json:"end,omitempty"`
		URL         string               `json:"url"`
		IsRecording bool                 `json:"is_recording"`
		HasMotion   bool                 `json:"has_motion"`
		Detections  []recordingDetection `json:"detections,omitempty"`
		mtime       time.Time            // not serialized; used to detect active recording
		path        string               // not serialized; used for DB has_motion lookup
		startTime   time.Time            // not serialized; used to backfill the DB row on demand
	}

	var all []recording
	for _, utcDay := range utcDays {
		dir := filepath.Join(s.cfg.RecordingsPath, id, utcDay.Format("2006/01/02"))
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".mp4") {
				continue
			}
			ts, err := time.ParseInLocation("20060102150405", strings.TrimSuffix(e.Name(), ".mp4"), time.UTC)
			if err != nil {
				continue
			}
			if ts.Before(dayStart) || !ts.Before(dayEnd) {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			all = append(all, recording{
				Filename:  e.Name(),
				Start:     ts.UTC().Format(time.RFC3339),
				URL:       "/recordings/" + id + "/" + utcDay.Format("2006/01/02") + "/" + e.Name(),
				mtime:     info.ModTime(),
				path:      filepath.Join(dir, e.Name()),
				startTime: ts,
			})
		}
	}

	// Only the file with the latest filename (= latest segment start) can be
	// actively recording. Marking all recent-mtime files would show two "REC"
	// badges during the brief overlap when a chunk closes and a new one opens.
	if len(all) > 0 {
		latest := 0
		for i := range all {
			if all[i].Filename > all[latest].Filename {
				latest = i
			}
		}
		// mtime<30s é o sinal barato (não abre o arquivo); só sonda o átomo moov
		// (storage.IsValidMP4 — mais caro, abre e lê o arquivo) quando o mtime sozinho já
		// não classificou como em andamento. Cobre o caso em que o chunk ativo (`-f
		// segment` do ffmpeg só fecha/grava o moov na rotação) ainda não foi finalizado
		// mesmo com mtime>30s (ex.: segmento mais longo que o normal) — sem esse reforço
		// esse chunk aparecia como "pronto" pro cliente, mas tocar/extrair frame dele
		// falhava sempre (duração nunca resolvia — "piscando", bug real reportado).
		if time.Since(all[latest].mtime) < 30*time.Second || !storage.IsValidMP4(all[latest].path) {
			all[latest].IsRecording = true
		}
	}
	// Enrich has_motion and DB id from DB.
	if s.db != nil && len(all) > 0 {
		paths := make([]string, len(all))
		for i, r := range all {
			paths[i] = r.path
		}
		if motionByPath, err := db.HasMotionByPaths(s.db, paths); err == nil {
			for i := range all {
				if motionByPath[all[i].path] {
					all[i].HasMotion = true
				}
			}
		}
		idsByPath, err := db.IDsByPaths(s.db, paths)
		if err != nil {
			idsByPath = nil
		}
		// Um chunk recém-criado no disco pode ainda não ter sido sincronizado pro banco
		// (storage.Cleaner.syncRecordings roda a cada 1 minuto) — sem uma linha na tabela
		// `recordings`, `IDsByPaths` não devolve nada pra ele e `all[i].ID` ficaria no zero
		// value (campo omitido no JSON por `omitempty`). O cliente seleciona esse chunk sem
		// id nenhum e, quando o sync o insere de verdade pouco depois (ganhando um id real),
		// a seleção anterior deixa de bater com qualquer item da lista — dispara a troca pra
		// "gravação apagada" (HistoryPage) e recarrega o player do zero. Numa câmera com
		// chunks de poucos segundos (girando bem mais rápido que o intervalo de 1 minuto do
		// sync) isso repete sem parar, e pareceu "piscar" independente do que o usuário
		// estivesse fazendo (bug real reportado). Insere na hora (idempotente, INSERT OR
		// IGNORE) qualquer chunk FINALIZADO ainda sem linha — todo chunk visível ao usuário
		// (nunca o `IsRecording`, que o cliente já filtra e nunca fica selecionável) já nasce
		// com um ID permanente antes de ser exposto pela API, então nunca muda depois. Pular
		// o chunk ativo evita gravar no banco um registro provisório pra um arquivo que
		// ainda está sendo escrito (pode nem terminar de fechar direito).
		missing := false
		for i := range all {
			if all[i].IsRecording {
				continue
			}
			if _, ok := idsByPath[all[i].path]; ok {
				continue
			}
			missing = true
			// chunkEnd = início do próximo chunk cronológico (mesma convenção de
			// syncRecordings) — sem isso, a linha nasceria com `ended_at` em aberto e o
			// `end` do JSON ficaria vazio; pro chunk mais novo da lista (sem duration por
			// `next` também, já que não há nenhum outro depois dele nessa página) a duração
			// não aparecia de jeito nenhum no card (reportado pelo navigator: "o primeiro
			// [item] sem o tempo").
			var chunkEnd time.Time
			for j := range all {
				if !all[j].startTime.After(all[i].startTime) {
					continue
				}
				if chunkEnd.IsZero() || all[j].startTime.Before(chunkEnd) {
					chunkEnd = all[j].startTime
				}
			}
			if err := db.InsertRecording(s.db, db.Recording{
				CameraID:  id,
				StartedAt: all[i].startTime,
				EndedAt:   chunkEnd,
				Path:      all[i].path,
			}); err != nil {
				s.log.Warn("recordings: failed to backfill db row", "path", all[i].path, "error", err)
			}
		}
		if missing {
			if refreshed, err := db.IDsByPaths(s.db, paths); err == nil {
				idsByPath = refreshed
			}
		}
		for i := range all {
			all[i].ID = idsByPath[all[i].path]
		}
		// end = ended_at real (só chunks finalizados; o chunk em gravação fica sem).
		if endedByPath, err := db.EndedAtByPaths(s.db, paths); err == nil {
			for i := range all {
				if e, ok := endedByPath[all[i].path]; ok {
					all[i].End = e.UTC().Format(time.RFC3339)
				}
			}
		}
	}

	// Enrich detections from detections table.
	if s.db != nil && len(all) > 0 {
		paths := make([]string, len(all))
		for i, r := range all {
			paths[i] = r.path
		}
		if detsByPath, err := db.DetectionsByPaths(s.db, paths); err == nil {
			for i := range all {
				if dets := detsByPath[all[i].path]; len(dets) > 0 {
					rd := make([]recordingDetection, len(dets))
					for j, d := range dets {
						rd[j] = recordingDetection{Label: d.Label, Confidence: d.Confidence, FrameCount: d.FrameCount, CustomModel: d.CustomModel}
					}
					all[i].Detections = rd
				}
			}
		}
	}

	sort.Slice(all, func(i, j int) bool {
		if order == "asc" {
			return all[i].Filename < all[j].Filename
		}
		return all[i].Filename > all[j].Filename
	})

	empty := map[string]any{"recordings": []any{}, "hasMore": false}
	if allRecs {
		w.Header().Set("Content-Type", "application/json")
		if len(all) == 0 {
			json.NewEncoder(w).Encode(empty)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"recordings": all, "hasMore": false, "total": len(all)})
		return
	}
	startIdx := (page - 1) * limit
	if startIdx >= len(all) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(empty)
		return
	}
	endIdx := startIdx + limit
	hasMore := endIdx < len(all)
	if endIdx > len(all) {
		endIdx = len(all)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"recordings": all[startIdx:endIdx], "hasMore": hasMore, "total": len(all)})
}

func (s *Server) handleRecordingByID(w http.ResponseWriter, r *http.Request) {
	cameraID := r.PathValue("id")
	recIDStr := r.PathValue("recording_id")
	recID, err := strconv.ParseInt(recIDStr, 10, 64)
	if err != nil || recID <= 0 {
		http.Error(w, "invalid recording id", http.StatusBadRequest)
		return
	}
	if s.db == nil {
		http.Error(w, "database not available", http.StatusServiceUnavailable)
		return
	}

	rec, err := db.GetRecordingByID(s.db, recID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if rec.CameraID != cameraID {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	loc, err := time.LoadLocation(s.timezone)
	if err != nil {
		loc = time.UTC
	}
	localStart := rec.StartedAt.In(loc)
	dateStr := localStart.Format("2006-01-02")

	// Derive the URL from the path relative to the recordings root.
	rel, err := filepath.Rel(s.cfg.RecordingsPath, rec.Path)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	url := "/recordings/" + filepath.ToSlash(rel)

	// Check if this is the actively-recording file (mtime < 30s) — ou, mesmo com mtime
	// mais velho, ainda sem o átomo moov (chunk ativo/corrompido, nunca finalizado — ver
	// mesmo reforço em handleRecordings acima).
	isRecording := false
	if info, err := os.Stat(rec.Path); err == nil {
		isRecording = time.Since(info.ModTime()) < 30*time.Second || !storage.IsValidMP4(rec.Path)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"id":           rec.ID,
		"filename":     filepath.Base(rec.Path),
		"date":         dateStr,
		"start":        rec.StartedAt.UTC().Format(time.RFC3339),
		"url":          url,
		"is_recording": isRecording,
		"has_motion":   rec.HasMotion,
	})
}

// utcDaysInRange returns the distinct UTC calendar days that overlap [start, end).
func utcDaysInRange(start, end time.Time) []time.Time {
	var days []time.Time
	d := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	for d.Before(end) {
		days = append(days, d)
		d = d.AddDate(0, 0, 1)
	}
	return days
}

// findRecordingPath returns the filesystem path for filename under cameraID.
// The recorder fixes the output directory at startup time, so a chunk that
// crosses UTC midnight lands in the previous day's directory. We try the day
// derived from the filename (chunkStart) and then the day before.
func findRecordingPath(recordingsPath, cameraID, filename string, chunkStart time.Time) string {
	for _, delta := range []int{0, -1} {
		dir := chunkStart.UTC().AddDate(0, 0, delta).Format("2006/01/02")
		p := filepath.Join(recordingsPath, cameraID, dir, filename)
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

func (s *Server) handleDeleteRecording(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	filename := r.PathValue("filename")

	var cam *config.CameraConfig
	for i := range s.cameras {
		if s.cameras[i].ID == id {
			cam = &s.cameras[i]
			break
		}
	}
	if cam == nil {
		http.NotFound(w, r)
		return
	}

	chunkStart, err := storage.ChunkStartFromName(filename)
	if err != nil {
		http.Error(w, "invalid filename", http.StatusBadRequest)
		return
	}
	chunkDuration := cam.EffectiveChunkDuration()
	chunkEnd := chunkStart.Add(chunkDuration)

	// The recorder creates the output directory from its startup time, so a
	// chunk that crosses a UTC midnight lands in the previous day's directory.
	// Try the UTC day derived from the filename first, then the day before.
	mp4Path := findRecordingPath(s.cfg.RecordingsPath, id, filename, chunkStart)
	if mp4Path != "" {
		if err := os.Remove(mp4Path); err != nil && !os.IsNotExist(err) {
			http.Error(w, "failed to delete recording", http.StatusInternalServerError)
			return
		}
	}

	if s.db != nil {
		if actualEnd, err := db.EndedAtByStartedAt(s.db, id, chunkStart); err == nil && !actualEnd.IsZero() {
			chunkEnd = actualEnd
		}
		// List before delete so the JPEGs (frame_path + its _frame.jpg
		// companion) can still be resolved — DeleteMotionEventsInRange alone
		// only clears the DB rows, leaving the files orphaned on disk forever.
		if events, err := db.ListMotionEvents(s.db, id, chunkStart, chunkEnd); err != nil {
			s.log.Warn("failed to list motion events before recording deletion", "camera", id, "err", err)
		} else {
			storage.RemoveMotionEventJPEGs(s.cfg.RecordingsPath, s.log, events)
		}
		if err := db.DeleteMotionEventsInRange(s.db, id, chunkStart, chunkEnd); err != nil {
			s.log.Warn("failed to clean motion events after recording deletion", "camera", id, "err", err)
		}
		if err := db.DeleteRecordingByStartedAt(s.db, id, chunkStart); err != nil {
			s.log.Warn("failed to remove recording row after deletion", "camera", id, "err", err)
		}
	} else {
		dateDir := chunkStart.UTC().Format("2006/01/02")
		ndjsonPath := filepath.Join(s.cfg.RecordingsPath, id, dateDir, "motion.ndjson")
		if err := storage.RemoveEventsInRange(ndjsonPath, chunkStart, chunkEnd); err != nil {
			s.log.Warn("failed to clean motion events after recording deletion", "path", ndjsonPath, "err", err)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	var recBytes int64
	var recCount int64

	if s.db != nil {
		if c, b, err := db.StatsRecordings(s.db); err == nil {
			recCount, recBytes = c, b
		}
	} else {
		filepath.WalkDir(s.cfg.RecordingsPath, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || filepath.Ext(path) != ".mp4" {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			recBytes += info.Size()
			recCount++
			return nil
		})
	}

	var diskTotal, diskFree int64
	if s.cfg.RecordingsPath != "" {
		diskTotal, diskFree = diskStats(s.cfg.RecordingsPath)
	}

	_, _, _, maxGB, warnPct, _ := s.effectiveStorageSettings()
	maxSizeBytes := int64(maxGB * 1024 * 1024 * 1024)

	chunkSec := int64(config.DefaultChunkDuration.Seconds())
	durationSec := recCount * chunkSec

	availableBytes := diskFree
	if maxSizeBytes > 0 {
		availableBytes = max(0, maxSizeBytes-recBytes)
	}
	// forecast = availableBytes * durationSec / recBytes
	// (avoids integer division truncating bytes_per_sec to 0 for small files)
	var forecastSec int64
	if durationSec > 0 && recBytes > 0 {
		forecastSec = availableBytes * durationSec / recBytes
	}

	allCameras := s.cameras
	if s.db != nil {
		if cams, err := db.ListCameras(s.db); err == nil {
			allCameras = cams
		}
	}

	type cameraStats struct {
		ID              string     `json:"id"`
		TopMotionScore  float64    `json:"top_motion_score"`
		MinMotionScore  float64    `json:"min_motion_score"`
		Online          bool       `json:"online"`
		LastRecordingAt *time.Time `json:"last_recording_at"`
		MotionEnabled   bool       `json:"motion_enabled"`
	}
	todayStart := time.Now().UTC().Truncate(24 * time.Hour)
	todayEnd := todayStart.Add(24 * time.Hour)

	var lastRec map[string]time.Time
	if s.db != nil {
		lastRec, _ = db.LastRecordingPerCamera(s.db)
	}

	cameras := make([]cameraStats, len(allCameras))
	onlineThreshold := 5 * time.Minute
	for i, cam := range allCameras {
		mn, mx := motionScoreRange(s.db, s.cfg.RecordingsPath, cam.ID, todayStart, todayEnd)
		cs := cameraStats{
			ID:             cam.ID,
			TopMotionScore: mx,
			MinMotionScore: mn,
			MotionEnabled:  cam.EffectiveMotionConfig().Enabled,
		}
		if t, ok := lastRec[cam.ID]; ok {
			ts := t
			cs.LastRecordingAt = &ts
			cs.Online = time.Since(t) <= onlineThreshold
		}
		cameras[i] = cs
	}

	sysMemTotal, sysMemFree := systemMemInfo()
	cpuPct := s.cpu.percent()
	netMbps := s.net.mbps()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"recordings_bytes":            recBytes,
		"recordings_count":            recCount,
		"recordings_duration_seconds": durationSec,
		"forecast_seconds":            forecastSec,
		"disk_total_bytes":            diskTotal,
		"disk_free_bytes":             diskFree,
		"camera_count":                len(allCameras),
		"connected_clients":           s.activeStreamClients(time.Now()),
		"max_size_bytes":              maxSizeBytes,
		"warn_percent":                warnPct,
		"cameras":                     cameras,
		"os":                          osName(),
		"pid":                         os.Getpid(),
		"cpu_percent":                 cpuPct,
		"net_mbps":                    netMbps,
		"mem_rss_bytes":               processMemRSS(),
		"sys_mem_total_bytes":         sysMemTotal,
		"sys_mem_free_bytes":          sysMemFree,
		"goroutines":                  runtime.NumGoroutine(),
	})
}

func motionScoreRange(database *db.DB, basePath, cameraID string, start, end time.Time) (min, max float64) {
	if database != nil {
		mn, mx, err := db.MinMaxScoreForDay(database, cameraID, start, end)
		if err == nil {
			return mn, mx
		}
	}
	utcDay := start.UTC().Format("2006/01/02")
	path := filepath.Join(basePath, cameraID, utcDay, "motion.ndjson")
	f, err := os.Open(path)
	if err != nil {
		return 0, 0
	}
	defer f.Close()
	first := true
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		var ev struct {
			Score float64 `json:"score"`
		}
		if json.Unmarshal(sc.Bytes(), &ev) != nil {
			continue
		}
		if first || ev.Score < min {
			min = ev.Score
		}
		if first || ev.Score > max {
			max = ev.Score
		}
		first = false
	}
	return min, max
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}
	user, err := db.GetUserByLogin(s.db, creds.Username)
	if err != nil || !db.CheckPassword(user.PasswordHash, creds.Password) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":                  creds.Username,
		"exp":                  time.Now().Add(24 * time.Hour).Unix(),
		"user_id":              user.ID,
		"role":                 user.Role,
		"must_change_password": user.MustChangePassword,
	})
	signed, err := token.SignedString(s.secret)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]string{"token": signed}); err != nil {
		s.log.Error("encode login response", "error", err)
	}
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	ac, _ := r.Context().Value(claimsKey).(authClaims)
	if ac.UserID == 0 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Password == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	if err := db.ClearMustChangePassword(s.db, ac.UserID, body.Password); err != nil {
		s.log.Error("change password failed", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleNotificationsLive é o SSE de notificações do usuário (push): assina o
// hub pelo user_id do JWT e transmite um evento sempre que uma notificação é
// criada para ele. Espelha handleMotionLive.
func (s *Server) handleNotificationsLive(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	ac, _ := r.Context().Value(claimsKey).(authClaims)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	sub := s.notifHub.subscribe(ac.UserID)
	defer s.notifHub.unsubscribe(ac.UserID, sub)

	for {
		select {
		case ev := <-sub:
			data, _ := json.Marshal(ev)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func (s *Server) handleMotionLive(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	s.mu.Lock()
	bc := s.motionBroadcasters[id]
	s.mu.Unlock()
	if bc == nil {
		http.NotFound(w, r)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	sub := bc.subscribe()
	defer bc.unsubscribe(sub)

	for {
		select {
		case ev, ok := <-sub:
			if !ok {
				return
			}
			payload := map[string]any{
				"time":  ev.Time.Format(time.RFC3339),
				"score": ev.Score,
			}
			if ev.Label != "" {
				payload["label"] = ev.Label
			}
			if ev.Color != "" {
				payload["color"] = ev.Color
			}
			data, _ := json.Marshal(payload)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func (s *Server) handleAllMotionLive(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	s.mu.Lock()
	type entry struct {
		id   string
		name string
		bc   *broadcaster
	}
	cameraNames := make(map[string]string, len(s.cameras))
	for _, c := range s.cameras {
		cameraNames[c.ID] = c.Name
	}
	var entries []entry
	for id, bc := range s.motionBroadcasters {
		if s.canAccessCamera(r, id) {
			entries = append(entries, entry{id, cameraNames[id], bc})
		}
	}
	s.mu.Unlock()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	if len(entries) == 0 {
		<-r.Context().Done()
		return
	}

	type taggedEvent struct {
		cameraID   string
		cameraName string
		ev         motion.Event
	}
	merged := make(chan taggedEvent, 64)

	var wg sync.WaitGroup
	for _, e := range entries {
		camID := e.id
		camName := e.name
		bc := e.bc
		sub := bc.subscribe()
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer bc.unsubscribe(sub)
			for {
				select {
				case ev, ok := <-sub:
					if !ok {
						return
					}
					select {
					case merged <- taggedEvent{cameraID: camID, cameraName: camName, ev: ev}:
					case <-r.Context().Done():
						return
					}
				case <-r.Context().Done():
					return
				}
			}
		}()
	}

	go func() {
		wg.Wait()
		close(merged)
	}()

	for {
		select {
		case te, ok := <-merged:
			if !ok {
				return
			}
			payload := map[string]any{
				"camera_id":   te.cameraID,
				"camera_name": te.cameraName,
				"time":        te.ev.Time.Format(time.RFC3339),
				"score":       te.ev.Score,
			}
			if te.ev.Label != "" {
				payload["label"] = te.ev.Label
			}
			if te.ev.Color != "" {
				payload["color"] = te.ev.Color
			}
			data, _ := json.Marshal(payload)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func (s *Server) handleMotionScores(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	s.mu.Lock()
	bc := s.rawBroadcasters[id]
	s.mu.Unlock()
	if bc == nil {
		http.NotFound(w, r)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	sub := bc.subscribe()
	defer bc.unsubscribe(sub)

	for {
		select {
		case ev, ok := <-sub:
			if !ok {
				return
			}
			data, _ := json.Marshal(map[string]any{
				"time":  ev.Time.Format(time.RFC3339),
				"score": ev.Score,
			})
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func (s *Server) handleMotionRegionScore(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	parseF := func(key string) (float64, bool) {
		v := r.URL.Query().Get(key)
		if v == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(v, 64)
		return f, err == nil
	}
	x, okX := parseF("x")
	y, okY := parseF("y")
	wf, okW := parseF("w")
	hf, okH := parseF("h")
	if !okX || !okY || !okW || !okH {
		http.Error(w, "x, y, w, h query params required", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	mon := s.monitors[id]
	s.mu.Unlock()
	if mon == nil {
		http.NotFound(w, r)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	bbox := motion.BBox{X: x, Y: y, W: wf, H: hf}
	inspID, ch := mon.RegisterInspector(bbox)
	defer mon.UnregisterInspector(inspID)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	for {
		select {
		case score, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(map[string]any{"score": score})
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func (s *Server) handleMotionDailyPeak(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	s.mu.Lock()
	_, hasRaw := s.rawBroadcasters[id]
	s.mu.Unlock()
	if !hasRaw {
		http.NotFound(w, r)
		return
	}

	today := time.Now().UTC().Format("2006-01-02")
	s.peakMu.RLock()
	peak := s.dailyPeakRaw[id]
	date := s.dailyPeakDate[id]
	s.peakMu.RUnlock()

	if date != today {
		peak = 0
		date = today
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"camera_id":      id,
		"peak_raw_score": peak,
		"date":           date,
	})
}

func (s *Server) cameraExists(id string) bool {
	for _, c := range s.cameras {
		if c.ID == id {
			return true
		}
	}
	return false
}

func (s *Server) cameraRTSP(id string) string {
	for _, c := range s.cameras {
		if c.ID == id {
			return c.RTSPURL
		}
	}
	return ""
}

func (s *Server) handleMotionZonesGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.cameraExists(id) {
		http.NotFound(w, r)
		return
	}
	var zs []zones.Zone
	if s.db != nil {
		var err error
		zs, err = db.GetZones(s.db, id)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	} else {
		zs = []zones.Zone{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(zs)
}

func (s *Server) handleMotionZonesPut(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.cameraExists(id) {
		http.NotFound(w, r)
		return
	}
	var zs []zones.Zone
	if err := json.NewDecoder(r.Body).Decode(&zs); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	for _, z := range zs {
		if z.X < 0 || z.Y < 0 || z.W <= 0 || z.H <= 0 ||
			z.X > 1 || z.Y > 1 || z.X+z.W > 1 || z.Y+z.H > 1 {
			http.Error(w, "zona inválida: coordenadas fora do intervalo [0,1]", http.StatusBadRequest)
			return
		}
	}
	if s.db == nil {
		w.WriteHeader(http.StatusOK)
		return
	}
	if err := db.SetZones(s.db, id, zs); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Refresh the running monitor's cached zones so the change takes effect
	// without restarting the process.
	s.mu.Lock()
	mon := s.monitors[id]
	s.mu.Unlock()
	if mon != nil {
		mon.ReloadZones()
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rtsp := s.cameraRTSP(id)
	if rtsp == "" {
		http.NotFound(w, r)
		return
	}
	if s.snapFn == nil {
		http.Error(w, "snapshot not available", http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	data, err := s.snapFn(ctx, rtsp)
	if err != nil || len(data) == 0 {
		http.Error(w, "snapshot failed", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Write(data)
}

func (s *Server) handleMotionEvents(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	dateStr := r.URL.Query().Get("date")

	loc, err := time.LoadLocation(s.timezone)
	if err != nil {
		loc = time.UTC
	}
	localDay, err := time.ParseInLocation("2006-01-02", dateStr, loc)
	if err != nil {
		http.Error(w, "invalid date", http.StatusBadRequest)
		return
	}
	dayStart := localDay.UTC()
	dayEnd := localDay.Add(24 * time.Hour).UTC()

	var events []map[string]any
	if s.db != nil {
		rows, err := db.ListMotionEvents(s.db, id, dayStart, dayEnd)
		if err == nil {
			for _, ev := range rows {
				entry := map[string]any{
					"id":    ev.ID,
					"time":  ev.OccurredAt.UTC().Format(time.RFC3339),
					"score": ev.Score,
					"bbox":  map[string]float64{"x": ev.BboxX, "y": ev.BboxY, "w": ev.BboxW, "h": ev.BboxH},
				}
				if ev.FramePath != "" {
					entry["frame"] = ev.FramePath
				}
				if ev.Label != "" {
					entry["label"] = ev.Label
				}
				if ev.Color != "" {
					entry["color"] = ev.Color
				}
				events = append(events, entry)
			}
		}
		// Mescla as transições de estado (todos os classificadores da câmera) no
		// mesmo feed, marcadas com kind="state". O frame já é um caminho servível
		// absoluto; o id é negativado para não colidir com motion_events.
		if transitions, err := db.ListCameraStateTransitions(s.db, id, dayStart, dayEnd); err == nil {
			for _, tr := range transitions {
				events = append(events, map[string]any{
					"kind":            "state",
					"id":              -tr.ID,
					"time":            tr.ChangedAt.UTC().Format(time.RFC3339),
					"score":           tr.Confidence,
					"frame":           tr.FramePath,
					"label":           tr.State,
					"classifier_id":   tr.ClassifierID,
					"classifier_name": tr.ClassifierName,
				})
			}
		}
		sort.Slice(events, func(i, j int) bool {
			ti, _ := events[i]["time"].(string)
			tj, _ := events[j]["time"].(string)
			return ti < tj
		})
	} else {
		utcDays := utcDaysInRange(dayStart, dayEnd)
		for _, utcDay := range utcDays {
			ndjsonPath := filepath.Join(s.cfg.RecordingsPath, id, utcDay.Format("2006/01/02"), "motion.ndjson")
			f, err := os.Open(ndjsonPath)
			if err != nil {
				continue
			}
			sc := bufio.NewScanner(f)
			for sc.Scan() {
				var ev map[string]any
				if json.Unmarshal(sc.Bytes(), &ev) != nil {
					continue
				}
				if timeStr, ok := ev["time"].(string); ok {
					t, err := time.Parse(time.RFC3339, timeStr)
					if err != nil || t.Before(dayStart) || !t.Before(dayEnd) {
						continue
					}
				}
				events = append(events, ev)
			}
			f.Close()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if events == nil {
		json.NewEncoder(w).Encode(map[string]any{"events": []any{}})
		return
	}
	json.NewEncoder(w).Encode(map[string]any{"events": events})
}
