package server_test

import (
	"log/slog"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/server"
)

type fakeMotionSender struct {
	calls []int64
}

func (f *fakeMotionSender) Send(_ notifications.Notification, userID int64) error {
	f.calls = append(f.calls, userID)
	return nil
}

func motionNotifyServer(t *testing.T) (*server.Server, *db.DB, *fakeMotionSender) {
	t.Helper()
	database := openServerTestDB(t)
	cameras := []config.CameraConfig{{ID: "cam1", Name: "Entrada", RTSPURL: "rtsp://fake1"}}
	for _, cam := range cameras {
		if _, err := db.CreateCamera(database, cam, nil); err != nil {
			t.Fatalf("seed camera %q: %v", cam.ID, err)
		}
	}
	fake := &fakeMotionSender{}
	srv := server.NewServer(config.ServerConfig{}, "UTC", cameras, discardLogger(), nil).
		WithDB(database).
		WithNotifications(notifications.NewDispatcher(slog.Default(), fake))
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

		srv.NotifyCameraMotion("cam1", 0.08)

		if len(fake.calls) != 1 || fake.calls[0] != uid {
			t.Fatalf("expected exactly one notify call to user %d, got %v", uid, fake.calls)
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

		srv.NotifyCameraMotion("cam1", 0.1)

		if len(fake.calls) != 0 {
			t.Fatalf("expected no notify call (score below min_score), got %v", fake.calls)
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

		srv.NotifyCameraMotion("cam1", 0.99)

		if len(fake.calls) != 0 {
			t.Fatalf("expected no notify call (opt-in disabled), got %v", fake.calls)
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

		srv.NotifyCameraMotion("cam1", 0.5)

		if len(fake.calls) != 0 {
			t.Fatalf("expected no notify call (opt-in belongs to a different camera), got %v", fake.calls)
		}
	})

	t.Run("CA5: sem dispatcher configurado, não panica", func(t *testing.T) {
		database := openServerTestDB(t)
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
		srv.NotifyCameraMotion("cam1", 0.5)
	})
}
