package application_test

import (
	"path/filepath"
	"testing"

	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/notifications/application"
)

type fakePush struct{ calls []int64 }

func (f *fakePush) Push(userID int64) { f.calls = append(f.calls, userID) }

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func TestApplicationSender_Send(t *testing.T) {
	database := openTestDB(t)
	uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	push := &fakePush{}
	s := application.New(database, push)

	t.Run("CA3: persiste a notificação e aciona o push ao vivo", func(t *testing.T) {
		if err := s.Send(notifications.Notification{Type: "info", Title: "T", Message: "M", Link: "/x"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		ns, err := db.ListUserNotifications(database, uid)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(ns) != 1 || ns[0].Title != "T" || ns[0].Message != "M" || ns[0].Link != "/x" {
			t.Fatalf("unexpected notification: %+v", ns)
		}
		if len(push.calls) != 1 || push.calls[0] != uid {
			t.Fatalf("expected live push for %d, got %v", uid, push.calls)
		}
	})

	t.Run("sem LivePush injetado, ainda persiste (nil-safe)", func(t *testing.T) {
		s2 := application.New(database, nil)
		if err := s2.Send(notifications.Notification{Type: "info", Title: "T2", Message: "M2"}, uid); err != nil {
			t.Fatalf("Send sem push: %v", err)
		}
	})
}
