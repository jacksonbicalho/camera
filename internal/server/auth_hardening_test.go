package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

const testJWTSecret = "fixed-secret-for-testing-32chars!"

// signClaims mints an HS256 token signed with testJWTSecret carrying exactly
// the given claims — used to forge tokens the normal login path never issues.
func signClaims(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return signed
}

// A token with a valid signature but no usable identity (no user_id/role) must
// be rejected outright (401), not silently downgraded to an anonymous-but-
// authenticated principal that requireFullAuth waves through.
func TestRequireAuthRejectsTokenWithoutIdentity(t *testing.T) {
	database := openServerTestDB(t)
	srv := server.NewServer(config.ServerConfig{JWTSecret: testJWTSecret}, "UTC", nil, discardLogger(), nil).
		WithDB(database)

	token := signClaims(t, jwt.MapClaims{
		"sub": "ghost",
		"exp": time.Now().Add(time.Hour).Unix(),
	})

	req := httptest.NewRequest(http.MethodGet, "/api/about", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("identity-less token: expected 401, got %d", w.Code)
	}
}

// Characterization of requireStreamAccess/requireRecordingsAccess, locked
// across the dedup refactor: a viewer without a grant is denied (403) and an
// empty camera segment is not found (404), on both prefixes.
func TestPrefixCameraAccess(t *testing.T) {
	database := openServerTestDB(t)
	viewerID, err := db.CreateUser(database, "viewer", "pw", "viewer", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if err := db.SetUserCameras(database, viewerID, []string{"cam1"}); err != nil {
		t.Fatalf("SetUserCameras: %v", err)
	}
	cams := []config.CameraConfig{
		{ID: "cam1", RTSPURL: "rtsp://fake1"},
		{ID: "cam2", RTSPURL: "rtsp://fake2"},
	}
	for _, c := range cams {
		if _, err := db.CreateCamera(database, c, nil); err != nil {
			t.Fatalf("CreateCamera %q: %v", c.ID, err)
		}
	}
	srv := server.NewServer(config.ServerConfig{JWTSecret: testJWTSecret}, "UTC", cams, discardLogger(), nil).
		WithDB(database)
	token := loginAndGetToken(t, srv, "viewer", "pw")

	for _, prefix := range []string{"/stream/", "/recordings/"} {
		// Ungranted camera → 403.
		req := httptest.NewRequest(http.MethodGet, prefix+"cam2/index.m3u8?token="+token, nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("%scam2 (ungranted): expected 403, got %d", prefix, w.Code)
		}

		// Empty camera id → 404.
		req = httptest.NewRequest(http.MethodGet, prefix+"?token="+token, nil)
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound {
			t.Errorf("%s(empty id): expected 404, got %d", prefix, w.Code)
		}
	}
}
