package db_test

import (
	"testing"

	"camera/internal/db"
)

func TestExtensionActive(t *testing.T) {
	database := openTestDB(t)

	t.Run("desabilitada por padrão quando nunca configurada", func(t *testing.T) {
		active, err := db.GetExtensionActive(database, "telegram")
		if err != nil {
			t.Fatalf("GetExtensionActive: %v", err)
		}
		if active {
			t.Error("expected disabled by default")
		}
	})

	t.Run("Set/Get round-trip", func(t *testing.T) {
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("SetExtensionActive(true): %v", err)
		}
		active, err := db.GetExtensionActive(database, "telegram")
		if err != nil {
			t.Fatalf("GetExtensionActive: %v", err)
		}
		if !active {
			t.Error("expected active after SetExtensionActive(true)")
		}

		if err := db.SetExtensionActive(database, "telegram", false); err != nil {
			t.Fatalf("SetExtensionActive(false): %v", err)
		}
		active, err = db.GetExtensionActive(database, "telegram")
		if err != nil {
			t.Fatalf("GetExtensionActive: %v", err)
		}
		if active {
			t.Error("expected disabled after SetExtensionActive(false)")
		}
	})

	t.Run("cada extensão tem sua própria chave — ativar uma não afeta a outra", func(t *testing.T) {
		if err := db.SetExtensionActive(database, "s3", true); err != nil {
			t.Fatalf("SetExtensionActive(s3, true): %v", err)
		}
		telegramActive, err := db.GetExtensionActive(database, "telegram")
		if err != nil {
			t.Fatal(err)
		}
		if telegramActive {
			t.Error("ativar s3 não deveria afetar telegram")
		}
	})
}
