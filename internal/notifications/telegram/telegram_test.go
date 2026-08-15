package telegram_test

import (
	"os"
	"path/filepath"
	"testing"

	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/notifications/telegram"
)

type fakeMessenger struct {
	chatID, text string
	calls        int

	photoChatID, photoCaption string
	photoBytes                []byte
	photoCalls                int
	sendPhotoErr              error
}

func (f *fakeMessenger) SendMessage(chatID, text string) error {
	f.chatID, f.text = chatID, text
	f.calls++
	return nil
}

func (f *fakeMessenger) SendPhoto(chatID string, photo []byte, caption string) error {
	f.photoChatID, f.photoBytes, f.photoCaption = chatID, photo, caption
	f.photoCalls++
	return f.sendPhotoErr
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

	t.Run("CA7: ImagePath aponta pra um arquivo existente, envia SendPhoto com o conteúdo do arquivo e a Message como caption (não chama SendMessage)", func(t *testing.T) {
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("set extension active: %v", err)
		}
		if err := db.SetUserTelegramChatID(database, uid, "chat-42"); err != nil {
			t.Fatalf("set chat id: %v", err)
		}
		imgPath := filepath.Join(t.TempDir(), "snapshot.jpg")
		if err := os.WriteFile(imgPath, []byte("fake-jpeg"), 0644); err != nil {
			t.Fatalf("write fake snapshot: %v", err)
		}
		m := &fakeMessenger{}
		s := telegram.New(database, m)
		n := notifications.Notification{Message: "Movimento detectado", ImagePath: imgPath}
		if err := s.Send(n, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		if m.photoCalls != 1 || m.photoChatID != "chat-42" || string(m.photoBytes) != "fake-jpeg" || m.photoCaption != "Movimento detectado" {
			t.Fatalf("unexpected SendPhoto call: chatID=%q bytes=%q caption=%q calls=%d",
				m.photoChatID, m.photoBytes, m.photoCaption, m.photoCalls)
		}
		if m.calls != 0 {
			t.Fatalf("expected SendMessage NOT to be called when SendPhoto succeeds, got %d calls", m.calls)
		}
	})

	t.Run("CA7: ImagePath aponta pra um arquivo inexistente, cai pro texto puro (SendMessage)", func(t *testing.T) {
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("set extension active: %v", err)
		}
		if err := db.SetUserTelegramChatID(database, uid, "chat-42"); err != nil {
			t.Fatalf("set chat id: %v", err)
		}
		m := &fakeMessenger{}
		s := telegram.New(database, m)
		n := notifications.Notification{Message: "Movimento detectado", ImagePath: filepath.Join(t.TempDir(), "no-such-file.jpg")}
		if err := s.Send(n, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		if m.photoCalls != 0 {
			t.Fatalf("expected SendPhoto NOT to be attempted for a missing file, got %d calls", m.photoCalls)
		}
		if m.calls != 1 || m.text != "Movimento detectado" {
			t.Fatalf("expected fallback to SendMessage with the plain Message, got calls=%d text=%q", m.calls, m.text)
		}
	})

	t.Run("CA7: SendPhoto falha (ex. API rejeita), cai pro texto puro (SendMessage) em vez de perder a notificação", func(t *testing.T) {
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("set extension active: %v", err)
		}
		if err := db.SetUserTelegramChatID(database, uid, "chat-42"); err != nil {
			t.Fatalf("set chat id: %v", err)
		}
		imgPath := filepath.Join(t.TempDir(), "snapshot.jpg")
		if err := os.WriteFile(imgPath, []byte("fake-jpeg"), 0644); err != nil {
			t.Fatalf("write fake snapshot: %v", err)
		}
		m := &fakeMessenger{sendPhotoErr: errSendPhotoFailed}
		s := telegram.New(database, m)
		n := notifications.Notification{Message: "Movimento detectado", ImagePath: imgPath}
		if err := s.Send(n, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		if m.calls != 1 || m.text != "Movimento detectado" {
			t.Fatalf("expected fallback to SendMessage after SendPhoto failure, got calls=%d text=%q", m.calls, m.text)
		}
	})
}

var errSendPhotoFailed = fakeSendPhotoError("simulated sendPhoto failure")

type fakeSendPhotoError string

func (e fakeSendPhotoError) Error() string { return string(e) }
