package alerts_test

import (
	"context"
	"io"
	"log/slog"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"camera/internal/alerts"
	"camera/internal/db"
	"camera/internal/events"
	"camera/internal/notifications"
	"camera/internal/recorder"
	"camera/internal/server"
	"camera/internal/transmission/hls"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

// spySender is a notifications.Sender test double that just records every
// Notification it was asked to send. Guarded by a mutex — Subscribe delivers
// on its own goroutine, so Send races with the test's polling reads without
// it.
type spySender struct {
	mu     sync.Mutex
	notifs []notifications.Notification
}

func (s *spySender) Send(n notifications.Notification, _ int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notifs = append(s.notifs, n)
	return nil
}

func (s *spySender) first() (notifications.Notification, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.notifs) == 0 {
		return notifications.Notification{}, false
	}
	return s.notifs[0], true
}

func (s *spySender) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.notifs)
}

func containsUserID(ids []int64, id int64) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}

// waitForNotification polls (Subscribe reacts to Publish on its own
// goroutine, so delivery isn't synchronous with the test's Publish call).
func waitForNotification(t *testing.T, spy *spySender) notifications.Notification {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if n, ok := spy.first(); ok {
			return n
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("esperava uma notificação, nenhuma chegou")
	return notifications.Notification{}
}

func TestSubscribe(t *testing.T) {
	t.Run("CA5: recorder.stopped publicado no bus vira Notification pra todo admin (e não pra quem não é admin)", func(t *testing.T) {
		database := openTestDB(t)
		adminID, err := db.CreateUser(database, "adm", "pw", "admin", false)
		if err != nil {
			t.Fatal(err)
		}
		viewerID, err := db.CreateUser(database, "viewer", "pw", "viewer", false)
		if err != nil {
			t.Fatal(err)
		}

		spy := &spySender{}
		dispatcher := notifications.NewDispatcher(discardLogger(), spy)
		bus := events.NewBus()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		alerts.Subscribe(ctx, bus, database, dispatcher, discardLogger())

		bus.Publish(events.Event{Type: recorder.EventStopped, CameraID: "cam1", At: time.Now()})

		got := waitForNotification(t, spy)
		if !containsUserID(got.UserIDs, adminID) {
			t.Errorf("UserIDs = %v, esperava conter o admin %d", got.UserIDs, adminID)
		}
		if containsUserID(got.UserIDs, viewerID) {
			t.Errorf("UserIDs = %v, não deveria conter o viewer %d", got.UserIDs, viewerID)
		}
	})

	t.Run("CA5: transmission.stopped publicado no bus também vira Notification pra todo admin", func(t *testing.T) {
		database := openTestDB(t)
		adminID, err := db.CreateUser(database, "adm", "pw", "admin", false)
		if err != nil {
			t.Fatal(err)
		}

		spy := &spySender{}
		dispatcher := notifications.NewDispatcher(discardLogger(), spy)
		bus := events.NewBus()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		alerts.Subscribe(ctx, bus, database, dispatcher, discardLogger())

		bus.Publish(events.Event{Type: hls.EventStopped, CameraID: "cam1", At: time.Now()})

		got := waitForNotification(t, spy)
		if !containsUserID(got.UserIDs, adminID) {
			t.Errorf("UserIDs = %v, esperava conter o admin %d", got.UserIDs, adminID)
		}
	})

	t.Run("CA4: update.applied publicado no bus vira Notification de sucesso pra todo admin", func(t *testing.T) {
		database := openTestDB(t)
		adminID, err := db.CreateUser(database, "adm", "pw", "admin", false)
		if err != nil {
			t.Fatal(err)
		}

		spy := &spySender{}
		dispatcher := notifications.NewDispatcher(discardLogger(), spy)
		bus := events.NewBus()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		alerts.Subscribe(ctx, bus, database, dispatcher, discardLogger())

		bus.Publish(events.Event{Type: server.EventUpdateApplied, At: time.Now()})

		got := waitForNotification(t, spy)
		if !containsUserID(got.UserIDs, adminID) {
			t.Errorf("UserIDs = %v, esperava conter o admin %d", got.UserIDs, adminID)
		}
		if got.Type != "success" {
			t.Errorf("Type = %q, quero success", got.Type)
		}
	})

	t.Run("CA4: update.failed publicado no bus vira Notification de aviso pra todo admin", func(t *testing.T) {
		database := openTestDB(t)
		adminID, err := db.CreateUser(database, "adm", "pw", "admin", false)
		if err != nil {
			t.Fatal(err)
		}

		spy := &spySender{}
		dispatcher := notifications.NewDispatcher(discardLogger(), spy)
		bus := events.NewBus()

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		alerts.Subscribe(ctx, bus, database, dispatcher, discardLogger())

		bus.Publish(events.Event{Type: server.EventUpdateFailed, At: time.Now()})

		got := waitForNotification(t, spy)
		if !containsUserID(got.UserIDs, adminID) {
			t.Errorf("UserIDs = %v, esperava conter o admin %d", got.UserIDs, adminID)
		}
		if got.Type != "warning" {
			t.Errorf("Type = %q, quero warning", got.Type)
		}
	})

	t.Run("CA5: para de assinar quando o contexto é cancelado", func(t *testing.T) {
		database := openTestDB(t)
		if _, err := db.CreateUser(database, "adm", "pw", "admin", false); err != nil {
			t.Fatal(err)
		}

		spy := &spySender{}
		dispatcher := notifications.NewDispatcher(discardLogger(), spy)
		bus := events.NewBus()

		ctx, cancel := context.WithCancel(context.Background())
		alerts.Subscribe(ctx, bus, database, dispatcher, discardLogger())
		cancel()
		time.Sleep(50 * time.Millisecond) // dá tempo do unsubscribe rodar

		bus.Publish(events.Event{Type: recorder.EventStopped, CameraID: "cam1", At: time.Now()})
		time.Sleep(100 * time.Millisecond)

		if n := spy.count(); n != 0 {
			t.Errorf("esperava nenhuma notificação após ctx cancelado, recebeu %d", n)
		}
	})
}
