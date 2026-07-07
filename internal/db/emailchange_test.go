package db_test

import (
	"testing"
	"time"

	"camera/internal/db"
)

func TestSetAndGetEmailChangeCode(t *testing.T) {
	database := openTestDB(t)
	id := mkUser(t, database, "sam")

	expiresAt := time.Now().Add(15 * time.Minute).Truncate(time.Second)
	if err := db.SetEmailChangeCode(database, id, "new@example.com", "123456", expiresAt); err != nil {
		t.Fatalf("SetEmailChangeCode: %v", err)
	}

	newEmail, code, gotExpiresAt, err := db.GetEmailChangeCode(database, id)
	if err != nil {
		t.Fatalf("GetEmailChangeCode: %v", err)
	}
	if newEmail != "new@example.com" {
		t.Errorf("expected new email 'new@example.com', got %q", newEmail)
	}
	if code != "123456" {
		t.Errorf("expected code '123456', got %q", code)
	}
	if !gotExpiresAt.Equal(expiresAt) {
		t.Errorf("expected expiry %v, got %v", expiresAt, gotExpiresAt)
	}
}

func TestGetEmailChangeCode_NoneSet(t *testing.T) {
	database := openTestDB(t)
	id := mkUser(t, database, "tara")

	newEmail, code, _, err := db.GetEmailChangeCode(database, id)
	if err != nil {
		t.Fatalf("GetEmailChangeCode: %v", err)
	}
	if newEmail != "" || code != "" {
		t.Errorf("expected empty new email/code, got %q/%q", newEmail, code)
	}
}

func TestClearEmailChangeCode(t *testing.T) {
	database := openTestDB(t)
	id := mkUser(t, database, "ursula")

	if err := db.SetEmailChangeCode(database, id, "new@example.com", "654321", time.Now().Add(time.Hour)); err != nil {
		t.Fatalf("SetEmailChangeCode: %v", err)
	}
	if err := db.ClearEmailChangeCode(database, id); err != nil {
		t.Fatalf("ClearEmailChangeCode: %v", err)
	}
	newEmail, code, _, err := db.GetEmailChangeCode(database, id)
	if err != nil {
		t.Fatalf("GetEmailChangeCode: %v", err)
	}
	if newEmail != "" || code != "" {
		t.Errorf("expected empty new email/code after clear, got %q/%q", newEmail, code)
	}
}
