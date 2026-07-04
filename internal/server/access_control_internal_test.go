package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
)

func nullLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func reqWithClaims(ac authClaims) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	return r.WithContext(context.WithValue(r.Context(), claimsKey, ac))
}

// canAccessCamera must fail closed when its source of truth (the DB) is
// unavailable: a viewer is denied, while an admin — who never depends on
// user_cameras — keeps access.
func TestCanAccessCameraFailsClosedWithoutDB(t *testing.T) {
	srv := NewServer(config.ServerConfig{}, "UTC", nil, nullLogger(), nil)
	// No WithDB: s.db is nil.

	if srv.canAccessCamera(reqWithClaims(authClaims{UserID: 5, Role: "viewer"}), "cam1") {
		t.Error("viewer must be denied when the DB is unavailable (fail-closed)")
	}
	if !srv.canAccessCamera(reqWithClaims(authClaims{UserID: 1, Role: "admin"}), "cam1") {
		t.Error("admin must retain access even without a DB")
	}
}

// handleChangePassword must not act on an unvalidated user id: a claims context
// with UserID==0 would otherwise run UPDATE ... WHERE id=0 (0 rows, no error)
// and answer 204 as if the password had changed.
func TestHandleChangePasswordRejectsZeroUserID(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	srv := NewServer(config.ServerConfig{}, "UTC", nil, nullLogger(), nil).WithDB(database)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", strings.NewReader(`{"password":"newpass"}`))
	req = req.WithContext(context.WithValue(req.Context(), claimsKey, authClaims{UserID: 0, MustChangePassword: true}))
	w := httptest.NewRecorder()

	srv.handleChangePassword(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("zero UserID: expected 401, got %d", w.Code)
	}
}
