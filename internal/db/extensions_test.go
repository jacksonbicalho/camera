package db_test

import (
	"testing"

	"camera/internal/db"
)

func TestTelegramExtension(t *testing.T) {
	database := openTestDB(t)

	t.Run("desabilitada por padrão quando nunca configurada", func(t *testing.T) {
		enabled, err := db.GetTelegramExtensionEnabled(database)
		if err != nil {
			t.Fatalf("GetTelegramExtensionEnabled: %v", err)
		}
		if enabled {
			t.Error("expected disabled by default")
		}
	})

	t.Run("Set/Get round-trip", func(t *testing.T) {
		if err := db.SetTelegramExtensionEnabled(database, true); err != nil {
			t.Fatalf("SetTelegramExtensionEnabled(true): %v", err)
		}
		enabled, err := db.GetTelegramExtensionEnabled(database)
		if err != nil {
			t.Fatalf("GetTelegramExtensionEnabled: %v", err)
		}
		if !enabled {
			t.Error("expected enabled after SetTelegramExtensionEnabled(true)")
		}

		if err := db.SetTelegramExtensionEnabled(database, false); err != nil {
			t.Fatalf("SetTelegramExtensionEnabled(false): %v", err)
		}
		enabled, err = db.GetTelegramExtensionEnabled(database)
		if err != nil {
			t.Fatalf("GetTelegramExtensionEnabled: %v", err)
		}
		if enabled {
			t.Error("expected disabled after SetTelegramExtensionEnabled(false)")
		}
	})
}
