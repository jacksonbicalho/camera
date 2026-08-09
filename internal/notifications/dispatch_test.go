package notifications_test

import (
	"errors"
	"log/slog"
	"testing"

	"camera/internal/notifications"
)

type fakeSender struct {
	err   error
	calls []int64
}

func (f *fakeSender) Send(_ notifications.Notification, userID int64) error {
	f.calls = append(f.calls, userID)
	return f.err
}

func TestDispatcher_Notify(t *testing.T) {
	t.Run("CA2: erro de um sender não impede os demais de serem chamados, nem os demais destinatários", func(t *testing.T) {
		failing := &fakeSender{err: errors.New("boom")}
		ok := &fakeSender{}
		d := notifications.NewDispatcher(slog.Default(), failing, ok)

		d.Notify(notifications.Notification{UserIDs: []int64{1, 2}, Title: "x"})

		if len(failing.calls) != 2 {
			t.Fatalf("expected failing sender to be called for both recipients, got %v", failing.calls)
		}
		if len(ok.calls) != 2 {
			t.Fatalf("expected the other sender to still be called for both recipients, got %v", ok.calls)
		}
	})

	t.Run("um Dispatcher sem senders é um Notify no-op (não deve nunca panicar)", func(t *testing.T) {
		d := notifications.NewDispatcher(slog.Default())
		d.Notify(notifications.Notification{UserIDs: []int64{1}, Title: "x"})
	})
}
