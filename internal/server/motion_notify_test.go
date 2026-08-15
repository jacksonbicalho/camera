package server_test

import (
	"log/slog"
	"path/filepath"
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

		srv.NotifyCameraMotion("cam1", time.Now(), 0.08, "")

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

		srv.NotifyCameraMotion("cam1", time.Now(), 0.1, "")

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

		srv.NotifyCameraMotion("cam1", time.Now(), 0.99, "")

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

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "")

		if len(fake.userIDs) != 0 {
			t.Fatalf("expected no notify call (opt-in belongs to a different camera), got %v", fake.userIDs)
		}
	})

	t.Run("CA5: sem telegramSender configurado, não panica", func(t *testing.T) {
		database := openServerTestDB(t)
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "")
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

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "")

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

		srv.NotifyCameraMotion("cam1", occurredAt, 0.016, "")

		if len(fake.notifs) != 1 {
			t.Fatalf("expected exactly one notification, got %d", len(fake.notifs))
		}
		msg := fake.notifs[0].Message
		for _, want := range []string{"15/08/2026 09:54:12", "Entrada", "0.016"} {
			if !stringsContains(msg, want) {
				t.Errorf("expected message to contain %q, got %q", want, msg)
			}
		}
	})

	t.Run("CA7: com public_url configurado, mensagem inclui o link pro histórico da câmera", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t, config.ServerConfig{PublicURL: "http://192.168.1.10:8080"})
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "")

		if !stringsContains(fake.notifs[0].Message, "http://192.168.1.10:8080/history/cam1") {
			t.Errorf("expected message to contain the public_url link, got %q", fake.notifs[0].Message)
		}
	})

	t.Run("CA7: sem public_url configurado, mensagem não inclui link nenhum", func(t *testing.T) {
		srv, database, fake := motionNotifyServer(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam1", true, 0.0); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "")

		if stringsContains(fake.notifs[0].Message, "http") {
			t.Errorf("expected message to contain no link when public_url is unset, got %q", fake.notifs[0].Message)
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

		srv.NotifyCameraMotion("cam1", occurredAt, 0.5, "20260815095412_motion.jpg")

		want := filepath.Join(cfg.RecordingsPath, "cam1", "2026/08/15", "20260815095412_motion.jpg")
		if fake.notifs[0].ImagePath != want {
			t.Errorf("expected ImagePath %q, got %q", want, fake.notifs[0].ImagePath)
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

		srv.NotifyCameraMotion("cam1", time.Now(), 0.5, "")

		if fake.notifs[0].ImagePath != "" {
			t.Errorf("expected empty ImagePath, got %q", fake.notifs[0].ImagePath)
		}
	})
}

func stringsContains(s, substr string) bool {
	return len(s) >= len(substr) && (substr == "" || indexOf(s, substr) >= 0)
}

func indexOf(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
