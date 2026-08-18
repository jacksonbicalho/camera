package server_test

import (
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/release"
	"camera/internal/server"
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
