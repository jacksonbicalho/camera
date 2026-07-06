package db_test

import (
	"testing"

	"camera/internal/db"
)

func TestUserTheme_DefaultIsDark(t *testing.T) {
	d := openTestDB(t)
	u := mkUser(t, d, "u1")

	th, err := db.GetUserTheme(d, u)
	if err != nil {
		t.Fatalf("GetUserTheme: %v", err)
	}
	if th != "dark" {
		t.Errorf("expected default theme 'dark', got %q", th)
	}
}

func TestUserTheme_SetAndGet(t *testing.T) {
	d := openTestDB(t)
	u := mkUser(t, d, "u1")

	if err := db.SetUserTheme(d, u, "light"); err != nil {
		t.Fatalf("SetUserTheme: %v", err)
	}
	th, err := db.GetUserTheme(d, u)
	if err != nil {
		t.Fatalf("GetUserTheme: %v", err)
	}
	if th != "light" {
		t.Errorf("expected 'light', got %q", th)
	}
}

func TestUserAccentColor_DefaultIsDefault(t *testing.T) {
	d := openTestDB(t)
	u := mkUser(t, d, "u1")

	accent, err := db.GetUserAccentColor(d, u)
	if err != nil {
		t.Fatalf("GetUserAccentColor: %v", err)
	}
	if accent != "default" {
		t.Errorf("expected default accent 'default', got %q", accent)
	}
}

func TestUserAccentColor_SetAndGet(t *testing.T) {
	d := openTestDB(t)
	u := mkUser(t, d, "u1")

	if err := db.SetUserAccentColor(d, u, "teal"); err != nil {
		t.Fatalf("SetUserAccentColor: %v", err)
	}
	accent, err := db.GetUserAccentColor(d, u)
	if err != nil {
		t.Fatalf("GetUserAccentColor: %v", err)
	}
	if accent != "teal" {
		t.Errorf("expected 'teal', got %q", accent)
	}
}

func TestUserTheme_AndAccentColor_Independent(t *testing.T) {
	d := openTestDB(t)
	u := mkUser(t, d, "u1")

	if err := db.SetUserTheme(d, u, "light"); err != nil {
		t.Fatalf("SetUserTheme: %v", err)
	}
	if err := db.SetUserAccentColor(d, u, "coral"); err != nil {
		t.Fatalf("SetUserAccentColor: %v", err)
	}
	th, err := db.GetUserTheme(d, u)
	if err != nil {
		t.Fatalf("GetUserTheme: %v", err)
	}
	if th != "light" {
		t.Errorf("expected theme 'light' to survive setting accent, got %q", th)
	}
}
