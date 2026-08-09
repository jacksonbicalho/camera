package email_test

import (
	"path/filepath"
	"testing"

	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/notifications/email"
)

type fakeMailer struct {
	to, subject, body string
	calls             int
}

func (f *fakeMailer) Send(to, subject, body string) error {
	f.to, f.subject, f.body = to, subject, body
	f.calls++
	return nil
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

func TestEmailSender_Send(t *testing.T) {
	database := openTestDB(t)
	uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := db.SetUserEmail(database, uid, "u1@example.com"); err != nil {
		t.Fatalf("set email: %v", err)
	}

	t.Run("CA6: sem notify:email_enabled, não envia (nem erro, nem chamada ao mailer)", func(t *testing.T) {
		m := &fakeMailer{}
		s := email.New(database, m)
		if err := s.Send(notifications.Notification{Title: "T", Message: "M"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		if m.calls != 0 {
			t.Fatalf("expected no email sent while disabled, got %d calls", m.calls)
		}
	})

	t.Run("CA6: com notify:email_enabled, formata Título/Mensagem em Assunto/Corpo e resolve o e-mail via db.GetUserEmail", func(t *testing.T) {
		if err := db.SetUserNotifyEmail(database, uid, true); err != nil {
			t.Fatalf("set notify email: %v", err)
		}
		m := &fakeMailer{}
		s := email.New(database, m)
		if err := s.Send(notifications.Notification{Title: "T", Message: "M"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		if m.calls != 1 || m.to != "u1@example.com" || m.subject != "T" || m.body != "M" {
			t.Fatalf("unexpected mailer call: to=%q subject=%q body=%q calls=%d", m.to, m.subject, m.body, m.calls)
		}
	})
}
