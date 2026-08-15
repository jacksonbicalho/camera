package telegram_test

import (
	"path/filepath"
	"testing"

	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/notifications/telegram"
)

type fakeMessenger struct {
	chatID, text string
	calls        int
}

func (f *fakeMessenger) SendMessage(chatID, text string) error {
	f.chatID, f.text = chatID, text
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

func TestTelegramSender_Send(t *testing.T) {
	database := openTestDB(t)
	uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	t.Run("CA3: client nil não falha e não envia", func(t *testing.T) {
		s := telegram.New(database, nil)
		if err := s.Send(notifications.Notification{Title: "T", Message: "M"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
	})

	t.Run("CA3: extensão não ativa na instância, não envia", func(t *testing.T) {
		if err := db.SetUserTelegramChatID(database, uid, "12345"); err != nil {
			t.Fatalf("set chat id: %v", err)
		}
		m := &fakeMessenger{}
		s := telegram.New(database, m)
		if err := s.Send(notifications.Notification{Title: "T", Message: "M"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		if m.calls != 0 {
			t.Fatalf("expected no message sent while extension inactive, got %d calls", m.calls)
		}
	})

	t.Run("CA3: extensão ativa mas usuário sem chat_id vinculado, não envia", func(t *testing.T) {
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("set extension active: %v", err)
		}
		if err := db.ClearUserTelegramChatID(database, uid); err != nil {
			t.Fatalf("clear chat id: %v", err)
		}
		m := &fakeMessenger{}
		s := telegram.New(database, m)
		if err := s.Send(notifications.Notification{Title: "T", Message: "M"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		if m.calls != 0 {
			t.Fatalf("expected no message sent while user unlinked, got %d calls", m.calls)
		}
	})

	t.Run("CA3: extensão ativa e usuário vinculado, envia a Message pro chat_id vinculado", func(t *testing.T) {
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("set extension active: %v", err)
		}
		if err := db.SetUserTelegramChatID(database, uid, "chat-42"); err != nil {
			t.Fatalf("set chat id: %v", err)
		}
		m := &fakeMessenger{}
		s := telegram.New(database, m)
		if err := s.Send(notifications.Notification{Title: "Movimento", Message: "Movimento detectado na câmera X"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		if m.calls != 1 || m.chatID != "chat-42" || m.text != "Movimento detectado na câmera X" {
			t.Fatalf("unexpected messenger call: chatID=%q text=%q calls=%d", m.chatID, m.text, m.calls)
		}
	})
}
