package server_test

import (
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/release"
	"camera/internal/server"
	"camera/internal/stateclass"
)

// spySender is a notifications.Sender test double shared by the tests below —
// it just records every Notification it was asked to send, so tests can
// inspect who was notified (and how many times) without touching the DB.
type spySender struct {
	notifs []notifications.Notification
}

func (s *spySender) Send(n notifications.Notification, _ int64) error {
	s.notifs = append(s.notifs, n)
	return nil
}

func (s *spySender) countFor(userID int64) int {
	count := 0
	for _, n := range s.notifs {
		for _, uid := range n.UserIDs {
			if uid == userID {
				count++
			}
		}
	}
	return count
}

func TestNotifyUpdateAvailable_UsesDispatcher(t *testing.T) {
	t.Run("CA4: NotifyUpdateAvailable migrado pro Dispatcher preserva dedup por versão e admins-only", func(t *testing.T) {
		database := openServerTestDB(t)
		adminID, _ := db.CreateUser(database, "adm", "pw", "admin", false)
		viewerID, _ := db.CreateUser(database, "vw", "pw", "viewer", false)

		spy := &spySender{}
		dispatcher := notifications.NewDispatcher(discardLogger(), spy)
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
			WithDB(database).
			WithNotifications(dispatcher)

		srv.NotifyUpdateAvailable(release.Status{Latest: "v2.0.0", UpdateAvailable: true})
		srv.NotifyUpdateAvailable(release.Status{Latest: "v2.0.0", UpdateAvailable: true}) // dedup: mesma versão

		if got := spy.countFor(adminID); got != 1 {
			t.Fatalf("expected 1 dispatch to admin (dedup), got %d", got)
		}
		if got := spy.countFor(viewerID); got != 0 {
			t.Fatalf("expected viewer to never be notified, got %d", got)
		}

		srv.NotifyUpdateAvailable(release.Status{Latest: "v3.0.0", UpdateAvailable: true}) // nova versão
		if got := spy.countFor(adminID); got != 2 {
			t.Fatalf("expected a 2nd dispatch for a new version, got %d", got)
		}
	})
}

func TestPublishClassifierState_UsesDispatcher(t *testing.T) {
	t.Run("CA4: notifyStateTransition migrado pro Dispatcher preserva canal configurável + acesso à câmera", func(t *testing.T) {
		database := openServerTestDB(t)
		v1ID, _ := db.CreateUser(database, "v1", "pw", "viewer", false)
		v2ID, _ := db.CreateUser(database, "v2", "pw", "viewer", false)
		cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://x/"}
		if _, err := db.CreateCamera(database, cam, nil); err != nil {
			t.Fatal(err)
		}
		if err := db.SetUserCameras(database, v1ID, []string{"cam1"}); err != nil {
			t.Fatal(err)
		}
		if err := db.SetUserCameras(database, v2ID, []string{}); err != nil {
			t.Fatal(err)
		}

		spy := &spySender{}
		dispatcher := notifications.NewDispatcher(discardLogger(), spy)
		srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).
			WithDB(database).
			WithNotifications(dispatcher)

		srv.PublishClassifierState(stateclass.Classifier{
			ID: 1, CameraID: "cam1", Name: "Portão",
			NotifyEnabled: true, NotifyUserIDs: []int64{v1ID, v2ID},
		}, "aberto", 0.9)

		if got := spy.countFor(v1ID); got != 1 {
			t.Errorf("v1 (com acesso à câmera) deveria ser notificado via Dispatcher, got %d", got)
		}
		if got := spy.countFor(v2ID); got != 0 {
			t.Errorf("v2 (sem acesso à câmera) não deveria ser notificado, got %d", got)
		}
	})
}
