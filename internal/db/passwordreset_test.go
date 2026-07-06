package db_test

import (
	"testing"
	"time"

	"camera/internal/db"
)

func TestSetAndGetPasswordResetToken(t *testing.T) {
	database := openTestDB(t)
	id := mkUser(t, database, "olga")

	expiresAt := time.Now().Add(30 * time.Minute).Truncate(time.Second)
	if err := db.SetPasswordResetToken(database, id, "tok-abc", expiresAt); err != nil {
		t.Fatalf("SetPasswordResetToken: %v", err)
	}

	token, gotExpiresAt, err := db.GetPasswordResetToken(database, id)
	if err != nil {
		t.Fatalf("GetPasswordResetToken: %v", err)
	}
	if token != "tok-abc" {
		t.Errorf("expected token 'tok-abc', got %q", token)
	}
	if !gotExpiresAt.Equal(expiresAt) {
		t.Errorf("expected expiry %v, got %v", expiresAt, gotExpiresAt)
	}
}

func TestGetPasswordResetToken_NoneSet(t *testing.T) {
	database := openTestDB(t)
	id := mkUser(t, database, "peter")

	token, _, err := db.GetPasswordResetToken(database, id)
	if err != nil {
		t.Fatalf("GetPasswordResetToken: %v", err)
	}
	if token != "" {
		t.Errorf("expected empty token, got %q", token)
	}
}

func TestClearPasswordResetToken(t *testing.T) {
	database := openTestDB(t)
	id := mkUser(t, database, "quinn")

	if err := db.SetPasswordResetToken(database, id, "tok-xyz", time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("SetPasswordResetToken: %v", err)
	}
	if err := db.ClearPasswordResetToken(database, id); err != nil {
		t.Fatalf("ClearPasswordResetToken: %v", err)
	}
	token, _, err := db.GetPasswordResetToken(database, id)
	if err != nil {
		t.Fatalf("GetPasswordResetToken: %v", err)
	}
	if token != "" {
		t.Errorf("expected empty token after clear, got %q", token)
	}
}

func TestFindUserByPasswordResetToken(t *testing.T) {
	database := openTestDB(t)
	id := mkUser(t, database, "rita")

	if err := db.SetPasswordResetToken(database, id, "tok-find-me", time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("SetPasswordResetToken: %v", err)
	}

	gotID, err := db.FindUserByPasswordResetToken(database, "tok-find-me")
	if err != nil {
		t.Fatalf("FindUserByPasswordResetToken: %v", err)
	}
	if gotID != id {
		t.Errorf("expected user id %d, got %d", id, gotID)
	}
}

func TestFindUserByPasswordResetToken_NotFound(t *testing.T) {
	database := openTestDB(t)
	_, err := db.FindUserByPasswordResetToken(database, "no-such-token")
	if err == nil {
		t.Error("expected error for unknown token")
	}
}
