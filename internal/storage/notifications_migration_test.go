package storage_test

import (
	"path/filepath"
	"testing"
	"time"

	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/storage"
)

// spySender is a notifications.Sender test double that just records every
// Notification it was asked to send.
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

func TestNotifyDiskHigh_UsesDispatcher(t *testing.T) {
	t.Run("CA5: notifyDiskHigh migrado pro Dispatcher preserva o edge-trigger (só notifica ao cruzar o limiar)", func(t *testing.T) {
		database := openTestDB(t)
		adminID, err := db.CreateUser(database, "adm", "pw", "admin", false)
		if err != nil {
			t.Fatal(err)
		}

		dir := t.TempDir()
		// 200 bytes total; maxSizeGB ~107 bytes, 70% threshold ~75 bytes → cruza o limiar.
		writeFileWithSize(t, filepath.Join(dir, "cam1", "file1.mp4"), 100)
		writeFileWithSize(t, filepath.Join(dir, "cam1", "file2.mp4"), 100)

		spy := &spySender{}
		dispatcher := notifications.NewDispatcher(discardLogger(), spy)
		const maxSizeGB = 1e-7 // ~107 bytes
		c := storage.New(dir, 0, 0, 5*time.Minute, maxSizeGB, 70, database, discardLogger()).
			WithNotifications(dispatcher)

		c.CheckSize()
		c.CheckSize() // ainda acima do limiar — edge-triggered, não deve notificar de novo

		if got := spy.countFor(adminID); got != 1 {
			t.Fatalf("expected exactly 1 dispatch (edge-triggered), got %d", got)
		}
	})
}
