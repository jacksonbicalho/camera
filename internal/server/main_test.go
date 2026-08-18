package server_test

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"

	"golang.org/x/crypto/bcrypt"
)

func TestMain(m *testing.M) {
	db.BcryptCost = bcrypt.MinCost
	os.Exit(m.Run())
}

// openServerTestDB opens an in-process SQLite database for testing and
// registers cleanup via t.Cleanup.
func openServerTestDB(t *testing.T) *db.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

// withTestUsers attaches a fresh test database to srv and seeds it with the
// default test credentials used across server_test.go:
//
//	"master" / "secret" → admin
//	"admin"  / "pw"     → admin
//	"u"      / "p"      → admin
//
// Tests that need custom users (e.g. viewers) should set up their own DB via
// openServerTestDB and call srv.WithDB(database) directly.
func withTestUsers(t *testing.T, srv *server.Server) *server.Server {
	return withTestUsersAndCameras(t, srv, nil)
}

// doJSON issues an HTTP request against srv with an optional JSON body and a
// bearer token — shared helper for tests that exercise the router directly.
func doJSON(t *testing.T, srv *server.Server, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w
}

// withTestUsersAndCameras is like withTestUsers but also seeds cameras into the DB.
func withTestUsersAndCameras(t *testing.T, srv *server.Server, cameras []config.CameraConfig) *server.Server {
	t.Helper()
	database := openServerTestDB(t)
	for _, u := range []struct{ name, pass, role string }{
		{"master", "secret", "admin"},
		{"admin", "pw", "admin"},
		{"u", "p", "admin"},
	} {
		if _, err := db.CreateUser(database, u.name, u.pass, u.role, false); err != nil {
			t.Fatalf("seed test user %q: %v", u.name, err)
		}
	}
	for _, cam := range cameras {
		if _, err := db.CreateCamera(database, cam, cam.Motion); err != nil {
			t.Fatalf("seed test camera %q: %v", cam.ID, err)
		}
	}
	return srv.WithDB(database)
}
