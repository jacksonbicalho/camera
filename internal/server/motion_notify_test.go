package server_test

import (
	"log/slog"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/server"
)

type fakeMotionSender struct {
	userIDs []int64
	notifs  []notifications.Notification
}

func (f *fakeMotionSender) Send(n notifications.Notification, userID int64) error {
	f.userIDs = append(f.userIDs, userID)
	f.notifs = append(f.notifs, n)
	return nil
}

func motionNotifyServer(t *testing.T, over ...config.ServerConfig) (*server.Server, *db.DB, *fakeMotionSender) {
	t.Helper()
	database := openServerTestDB(t)
	cameras := []config.CameraConfig{{ID: "cam1", Name: "Entrada", RTSPURL: "rtsp://fake1"}}
	for _, cam := range cameras {
		if _, err := db.CreateCamera(database, cam, nil); err != nil {
			t.Fatalf("seed camera %q: %v", cam.ID, err)
		}
	}
	cfg := config.ServerConfig{}
	if len(over) > 0 {
		cfg = over[0]
	}
	fake := &fakeMotionSender{}
	srv := server.NewServer(cfg, "UTC", cameras, discardLogger(), nil).
		WithDB(database).
		WithTelegramSender(fake)
	return srv, database, fake
}

func TestNotifyCameraMotion(t *testing.T) {
	t.Run("CA5: usuário com opt-in ativo e score acima do mínimo é notificado", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.05); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.08, "", 0, 0)

		if len(fake.userIDs) != 1 || fake.userIDs[0] != uid {
			t.Fatalf("expected exactly one notify call to user %d, got %v", uid, fake.userIDs)
		}
	})

	t.Run("CA5: score abaixo do mínimo configurado não notifica", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.5); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.1, "", 0, 0)

		if len(fake.userIDs) != 0 {
			t.Fatalf("expected no notify call (score below min_score), got %v", fake.userIDs)
		}
	})

	t.Run("CA5: usuário sem opt-in ativo não é notificado, mesmo com score alto", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", false, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.99, "", 0, 0)

		if len(fake.userIDs) != 0 {
			t.Fatalf("expected no notify call (opt-in disabled), got %v", fake.userIDs)
		}
	})

	t.Run("CA5: opt-in de outra câmera não vaza pra esta notificação", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam-outra", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "", 0, 0)

		if len(fake.userIDs) != 0 {
			t.Fatalf("expected no notify call (opt-in belongs to a different camera), got %v", fake.userIDs)
		}
	})

	t.Run("CA5: sem telegramSender configurado, não panica", func(t *testing.T) {
		database := openServerTestDB(t)
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "", 0, 0)
	})

	t.Run("CA7: nunca passa pelo Dispatcher genérico — sino/e-mail in-app não recebem notificação de movimento", func(t *testing.T) {
		srv, database, telegramFake := motionNotifyServer(t)
		generic := &fakeMotionSender{}
		srv.WithNotifications(notifications.NewDispatcher(slog.Default(), generic))

		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "", 0, 0)

		if len(telegramFake.userIDs) != 1 {
			t.Fatalf("expected the dedicated telegram sender to be called once, got %v", telegramFake.userIDs)
		}
		if len(generic.userIDs) != 0 {
			t.Fatalf("expected the generic Dispatcher (in-app bell/email) to NEVER be called for motion events, got %v", generic.userIDs)
		}
	})

	t.Run("CA7: mensagem inclui data/hora local, câmera e score", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}
		occurredAt := time.Date(2026, 8, 15, 9, 54, 12, 0, time.UTC)

		srv.NotifyCameraMotion("cam1", occurredAt, 0.016, "", 0, 0)

		if len(fake.notifs) != 1 {
			t.Fatalf("expected exactly one notification, got %d", len(fake.notifs))
		}
		msg := fake.notifs[0].Message
		for _, want := range []string{"15/08/2026 09:54:12", "Entrada", "0.016"} {
			if !strings.Contains(msg, want) {
				t.Errorf("expected message to contain %q, got %q", want, msg)
			}
		}
	})

	t.Run("CA9: com public_url configurado e recordingID/motionEventID, mensagem inclui link clicável pro evento específico", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t, config.ServerConfig{PublicURL: "http://192.168.1.10:8080"})
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "", 42, 7)

		msg := fake.notifs[0].Message
		wantHref := `href="http://192.168.1.10:8080/recording/cam1/42/7"`
		if !strings.Contains(msg, wantHref) {
			t.Errorf("expected message to contain a clickable <a href> to the specific event, got %q", msg)
		}
		if !strings.Contains(msg, "<a href=") || !strings.Contains(msg, "</a>") {
			t.Errorf("expected an HTML anchor tag (parse_mode=HTML) for the link, got %q", msg)
		}
	})

	t.Run("CA9: sem public_url configurado, mensagem não inclui link nenhum", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "", 42, 7)

		if strings.Contains(fake.notifs[0].Message, "http") {
			t.Errorf("expected message to contain no link when public_url is unset, got %q", fake.notifs[0].Message)
		}
	})

	t.Run("CA9: nome da câmera é escapado no HTML (evita quebrar a mensagem/injetar markup)", func(t *testing.T) {
		cameras := []config.CameraConfig{{ID: "cam1", Name: "Entrada <principal> & Cia", RTSPURL: "rtsp://fake1"}}
		database := openServerTestDB(t)
		for _, cam := range cameras {
			if _, err := db.CreateCamera(database, cam, nil); err != nil {
				t.Fatalf("seed camera: %v", err)
			}
		}
		fake := &fakeMotionSender{}
		srv := server.NewServer(config.ServerConfig{}, "UTC", cameras, discardLogger(), nil).
			WithDB(database).
			WithTelegramSender(fake)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "", 0, 0)

		msg := fake.notifs[0].Message
		if strings.Contains(msg, "<principal>") {
			t.Errorf("expected camera name's < > to be HTML-escaped, got %q", msg)
		}
		if !strings.Contains(msg, "&lt;principal&gt;") {
			t.Errorf("expected escaped &lt;principal&gt; in message, got %q", msg)
		}
	})

	t.Run("CA7: framePath resolve pro path absoluto do snapshot (RecordingsPath/câmera/data/arquivo)", func(t *testing.T) {
		cfg := config.ServerConfig{RecordingsPath: t.TempDir()}
		srv, database, fake := motionNotifyServer(t, cfg)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}
		occurredAt := time.Date(2026, 8, 15, 9, 54, 12, 0, time.UTC)

		srv.NotifyCameraMotion("cam1", occurredAt, 0.5, "20260815095412_motion.jpg", 0, 0)

		want := filepath.Join(cfg.RecordingsPath, "cam1", "2026/08/15", "20260815095412_motion.jpg")
		if fake.notifs[0].ImagePath != want {
			t.Errorf("expected ImagePath %q, got %q", want, fake.notifs[0].ImagePath)
		}
	})

	t.Run("CA3: webpush notifica todo usuário com acesso à câmera (admin sempre; viewer só com grant), sem precisar de opt-in por câmera", func(t *testing.T) {
		database := openServerTestDB(t)
		cameras := []config.CameraConfig{{ID: "cam1", Name: "Entrada", RTSPURL: "rtsp://fake1"}}
		if _, err := db.CreateCamera(database, cameras[0], nil); err != nil {
			t.Fatalf("seed camera: %v", err)
		}
		webpushFake := &fakeMotionSender{}
		srv := server.NewServer(config.ServerConfig{}, "UTC", cameras, discardLogger(), nil).
			WithDB(database).
			WithWebpushSender(webpushFake)

		adminID, err := db.CreateUser(database, "admin1", "pw", "admin", false)
		if err != nil {
			t.Fatalf("create admin: %v", err)
		}
		grantedID, err := db.CreateUser(database, "viewer-com-acesso", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create viewer com acesso: %v", err)
		}
		if err := db.SetUserCameras(database, grantedID, []string{"cam1"}); err != nil {
			t.Fatalf("grant: %v", err)
		}
		if _, err := db.CreateUser(database, "viewer-sem-acesso", "pw", "viewer", false); err != nil {
			t.Fatalf("create viewer sem acesso: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "", 0, 0)

		if len(webpushFake.userIDs) != 2 {
			t.Fatalf("esperava 2 destinatários (admin + viewer com grant), got %v", webpushFake.userIDs)
		}
		got := map[int64]bool{webpushFake.userIDs[0]: true, webpushFake.userIDs[1]: true}
		if !got[adminID] || !got[grantedID] {
			t.Errorf("destinatários = %v, esperava admin(%d) e viewer com grant(%d)", webpushFake.userIDs, adminID, grantedID)
		}
	})

	t.Run("CA3: mensagem do webpush é texto plano (sem markup HTML do Telegram) e independe de opt-in do Telegram", func(t *testing.T) {
		database := openServerTestDB(t)
		cameras := []config.CameraConfig{{ID: "cam1", Name: "Entrada", RTSPURL: "rtsp://fake1"}}
		if _, err := db.CreateCamera(database, cameras[0], nil); err != nil {
			t.Fatalf("seed camera: %v", err)
		}
		webpushFake := &fakeMotionSender{}
		srv := server.NewServer(config.ServerConfig{}, "UTC", cameras, discardLogger(), nil).
			WithDB(database).
			WithWebpushSender(webpushFake)
		adminID, err := db.CreateUser(database, "admin1", "pw", "admin", false)
		if err != nil {
			t.Fatalf("create admin: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.923, "", 0, 0)

		if len(webpushFake.notifs) != 1 {
			t.Fatalf("esperava 1 notificação, got %d", len(webpushFake.notifs))
		}
		msg := webpushFake.notifs[0].Message
		if strings.Contains(msg, "<b>") || strings.Contains(msg, "<a href") {
			t.Errorf("mensagem do webpush não deveria ter markup HTML do Telegram: %q", msg)
		}
		if !strings.Contains(msg, "Entrada") || !strings.Contains(msg, "92.3%") {
			t.Errorf("mensagem = %q, esperava conter câmera e score", msg)
		}
		if webpushFake.userIDs[0] != adminID {
			t.Errorf("userID = %d, quero %d", webpushFake.userIDs[0], adminID)
		}
	})

	t.Run("CA3: telegram e webpush operam de forma independente — um sem o outro não impede nada", func(t *testing.T) {
		database := openServerTestDB(t)
		cameras := []config.CameraConfig{{ID: "cam1", Name: "Entrada", RTSPURL: "rtsp://fake1"}}
		if _, err := db.CreateCamera(database, cameras[0], nil); err != nil {
			t.Fatalf("seed camera: %v", err)
		}
		telegramFake := &fakeMotionSender{}
		webpushFake := &fakeMotionSender{}
		srv := server.NewServer(config.ServerConfig{}, "UTC", cameras, discardLogger(), nil).
			WithDB(database).
			WithTelegramSender(telegramFake).
			WithWebpushSender(webpushFake)

		telegramUID, err := db.CreateUser(database, "telegram-user", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameras(database, telegramUID, []string{"cam1"}); err != nil {
			t.Fatalf("grant: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, telegramUID, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}
		// admin não tem opt-in de Telegram, mas TEM acesso (implícito) — deve
		// receber via webpush mesmo sem nunca ter configurado nada de Telegram.
		adminID, err := db.CreateUser(database, "admin1", "pw", "admin", false)
		if err != nil {
			t.Fatalf("create admin: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "", 0, 0)

		if len(telegramFake.userIDs) != 1 || telegramFake.userIDs[0] != telegramUID {
			t.Errorf("telegram recipients = %v, quero só [%d]", telegramFake.userIDs, telegramUID)
		}
		got := map[int64]bool{}
		for _, uid := range webpushFake.userIDs {
			got[uid] = true
		}
		if !got[telegramUID] || !got[adminID] || len(webpushFake.userIDs) != 2 {
			t.Errorf("webpush recipients = %v, quero [%d %d]", webpushFake.userIDs, telegramUID, adminID)
		}
	})

	t.Run("CA7: framePath vazio não define ImagePath nenhum", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "", 0, 0)

		if fake.notifs[0].ImagePath != "" {
			t.Errorf("expected empty ImagePath, got %q", fake.notifs[0].ImagePath)
		}
	})
}
