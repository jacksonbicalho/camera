package db_test

import (
	"testing"
	"time"

	"camera/internal/db"
)

func TestTelegramLinkCode(t *testing.T) {
	t.Run("CA2: código persiste e resolve de volta pro usuário que o gerou", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-link-a")

		if err := db.SetTelegramLinkCode(database, id, "code-abc", time.Now().Add(10*time.Minute)); err != nil {
			t.Fatalf("SetTelegramLinkCode: %v", err)
		}
		gotID, err := db.FindUserByTelegramLinkCode(database, "code-abc")
		if err != nil {
			t.Fatalf("FindUserByTelegramLinkCode: %v", err)
		}
		if gotID != id {
			t.Errorf("expected user id %d, got %d", id, gotID)
		}
	})

	t.Run("CA2: código desconhecido não resolve nenhum usuário", func(t *testing.T) {
		database := openTestDB(t)
		if _, err := db.FindUserByTelegramLinkCode(database, "no-such-code"); err == nil {
			t.Error("expected error for unknown code")
		}
	})

	t.Run("CA2: código expirado não resolve mais nenhum usuário", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-link-expired")
		if err := db.SetTelegramLinkCode(database, id, "code-expired", time.Now().Add(-time.Minute)); err != nil {
			t.Fatalf("SetTelegramLinkCode: %v", err)
		}
		if _, err := db.FindUserByTelegramLinkCode(database, "code-expired"); err == nil {
			t.Error("expected expired code to not resolve")
		}
	})

	t.Run("CA2: gerar um novo código pro mesmo usuário invalida o anterior", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-link-overwrite")
		if err := db.SetTelegramLinkCode(database, id, "code-1", time.Now().Add(time.Hour)); err != nil {
			t.Fatalf("SetTelegramLinkCode(code-1): %v", err)
		}
		if err := db.SetTelegramLinkCode(database, id, "code-2", time.Now().Add(time.Hour)); err != nil {
			t.Fatalf("SetTelegramLinkCode(code-2): %v", err)
		}
		if _, err := db.FindUserByTelegramLinkCode(database, "code-1"); err == nil {
			t.Error("expected the old code to no longer resolve after a new one is issued")
		}
		gotID, err := db.FindUserByTelegramLinkCode(database, "code-2")
		if err != nil {
			t.Fatalf("FindUserByTelegramLinkCode(code-2): %v", err)
		}
		if gotID != id {
			t.Errorf("expected user id %d, got %d", id, gotID)
		}
	})

	t.Run("CA2: ClearTelegramLinkCode remove o código pendente", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-link-clear")
		if err := db.SetTelegramLinkCode(database, id, "code-clear", time.Now().Add(time.Hour)); err != nil {
			t.Fatalf("SetTelegramLinkCode: %v", err)
		}
		if err := db.ClearTelegramLinkCode(database, id); err != nil {
			t.Fatalf("ClearTelegramLinkCode: %v", err)
		}
		if _, err := db.FindUserByTelegramLinkCode(database, "code-clear"); err == nil {
			t.Error("expected code to be gone after Clear")
		}
	})
}

func TestTelegramChatID(t *testing.T) {
	t.Run("CA2: sem vínculo, chat_id é vazio", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-chatid-empty")
		chatID, err := db.GetUserTelegramChatID(database, id)
		if err != nil {
			t.Fatalf("GetUserTelegramChatID: %v", err)
		}
		if chatID != "" {
			t.Errorf("expected empty chat_id before linking, got %q", chatID)
		}
	})

	t.Run("CA2: chat_id persiste, é lido de volta, e Clear desvincula", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-chatid-set")

		if err := db.SetUserTelegramChatInfo(database, id, "12345", "janedoe", "Jane", "Doe"); err != nil {
			t.Fatalf("SetUserTelegramChatInfo: %v", err)
		}
		chatID, err := db.GetUserTelegramChatID(database, id)
		if err != nil {
			t.Fatalf("GetUserTelegramChatID: %v", err)
		}
		if chatID != "12345" {
			t.Errorf("expected chat_id '12345', got %q", chatID)
		}

		if err := db.ClearUserTelegramChatID(database, id); err != nil {
			t.Fatalf("ClearUserTelegramChatID: %v", err)
		}
		chatID, err = db.GetUserTelegramChatID(database, id)
		if err != nil {
			t.Fatalf("GetUserTelegramChatID: %v", err)
		}
		if chatID != "" {
			t.Errorf("expected chat_id cleared, got %q", chatID)
		}
	})
}

func TestTelegramChatInfo(t *testing.T) {
	t.Run("CA2: sem vínculo, todos os campos vêm vazios", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-chatinfo-empty")
		chatID, username, firstName, lastName, err := db.GetUserTelegramChatInfo(database, id)
		if err != nil {
			t.Fatalf("GetUserTelegramChatInfo: %v", err)
		}
		if chatID != "" || username != "" || firstName != "" || lastName != "" {
			t.Errorf("expected all fields empty before linking, got chatID=%q username=%q first=%q last=%q",
				chatID, username, firstName, lastName)
		}
	})

	t.Run("CA2: SetUserTelegramChatInfo persiste chat_id+identidade juntos, e Clear apaga tudo", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-chatinfo-set")

		if err := db.SetUserTelegramChatInfo(database, id, "999", "janedoe", "Jane", "Doe"); err != nil {
			t.Fatalf("SetUserTelegramChatInfo: %v", err)
		}
		chatID, username, firstName, lastName, err := db.GetUserTelegramChatInfo(database, id)
		if err != nil {
			t.Fatalf("GetUserTelegramChatInfo: %v", err)
		}
		if chatID != "999" || username != "janedoe" || firstName != "Jane" || lastName != "Doe" {
			t.Errorf("expected chatID=999 username=janedoe first=Jane last=Doe, got chatID=%q username=%q first=%q last=%q",
				chatID, username, firstName, lastName)
		}

		if err := db.ClearUserTelegramChatID(database, id); err != nil {
			t.Fatalf("ClearUserTelegramChatID: %v", err)
		}
		chatID, username, firstName, lastName, err = db.GetUserTelegramChatInfo(database, id)
		if err != nil {
			t.Fatalf("GetUserTelegramChatInfo: %v", err)
		}
		if chatID != "" || username != "" || firstName != "" || lastName != "" {
			t.Errorf("expected all fields cleared, got chatID=%q username=%q first=%q last=%q",
				chatID, username, firstName, lastName)
		}
	})

	t.Run("CA2: username pode ficar vazio (usuário sem @handle público) sem quebrar os demais campos", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-chatinfo-no-username")

		if err := db.SetUserTelegramChatInfo(database, id, "999", "", "Jane", ""); err != nil {
			t.Fatalf("SetUserTelegramChatInfo: %v", err)
		}
		chatID, username, firstName, lastName, err := db.GetUserTelegramChatInfo(database, id)
		if err != nil {
			t.Fatalf("GetUserTelegramChatInfo: %v", err)
		}
		if chatID != "999" || username != "" || firstName != "Jane" || lastName != "" {
			t.Errorf("expected chatID=999 username='' first=Jane last='', got chatID=%q username=%q first=%q last=%q",
				chatID, username, firstName, lastName)
		}
	})
}
