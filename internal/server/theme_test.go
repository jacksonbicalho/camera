package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

func themeServer(t *testing.T) (*server.Server, string) {
	t.Helper()
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "u1", "pw", "viewer", false); err != nil {
		t.Fatalf("create user: %v", err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "u1", "pw")
	return srv, token
}

func getTheme(t *testing.T, srv http.Handler, token string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET preferences: expected 200, got %d", w.Code)
	}
	var r struct {
		Theme string `json:"theme"`
	}
	if err := json.NewDecoder(w.Body).Decode(&r); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return r.Theme
}

func putTheme(t *testing.T, srv http.Handler, token, theme string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/me/preferences", strings.NewReader(`{"theme":"`+theme+`"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w.Code
}

func getAccent(t *testing.T, srv http.Handler, token string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET preferences: expected 200, got %d", w.Code)
	}
	var r struct {
		Accent string `json:"accent"`
	}
	if err := json.NewDecoder(w.Body).Decode(&r); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return r.Accent
}

func putAccent(t *testing.T, srv http.Handler, token, accent string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/me/preferences", strings.NewReader(`{"accent":"`+accent+`"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w.Code
}

func TestPreferences_DefaultThemeIsDark(t *testing.T) {
	srv, token := themeServer(t)
	if th := getTheme(t, srv, token); th != "dark" {
		t.Errorf("expected default theme 'dark', got %q", th)
	}
}

func TestPreferences_SetValidTheme(t *testing.T) {
	srv, token := themeServer(t)
	if code := putTheme(t, srv, token, "light"); code != http.StatusNoContent && code != http.StatusOK {
		t.Fatalf("PUT light: expected 200/204, got %d", code)
	}
	if th := getTheme(t, srv, token); th != "light" {
		t.Errorf("expected 'light' after PUT, got %q", th)
	}
}

func TestPreferences_AcceptsSystemTheme(t *testing.T) {
	srv, token := themeServer(t)
	if code := putTheme(t, srv, token, "system"); code != http.StatusNoContent && code != http.StatusOK {
		t.Fatalf("PUT system: expected 200/204, got %d", code)
	}
	if th := getTheme(t, srv, token); th != "system" {
		t.Errorf("expected 'system' after PUT, got %q", th)
	}
}

func TestPreferences_RejectsInvalidTheme(t *testing.T) {
	srv, token := themeServer(t)
	if code := putTheme(t, srv, token, "rainbow"); code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid theme, got %d", code)
	}
}

func TestPreferences_RequiresAuth(t *testing.T) {
	srv, _ := themeServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without token, got %d", w.Code)
	}
}

func TestPreferences_DefaultAccentIsDefault(t *testing.T) {
	srv, token := themeServer(t)
	if ac := getAccent(t, srv, token); ac != "default" {
		t.Errorf("expected default accent 'default', got %q", ac)
	}
}

func TestPreferences_SetValidAccent(t *testing.T) {
	srv, token := themeServer(t)
	if code := putAccent(t, srv, token, "teal"); code != http.StatusNoContent && code != http.StatusOK {
		t.Fatalf("PUT teal: expected 200/204, got %d", code)
	}
	if ac := getAccent(t, srv, token); ac != "teal" {
		t.Errorf("expected 'teal' after PUT, got %q", ac)
	}
}

func TestPreferences_RejectsInvalidAccent(t *testing.T) {
	srv, token := themeServer(t)
	if code := putAccent(t, srv, token, "rainbow"); code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid accent, got %d", code)
	}
}

func TestPreferences_SetAccentDoesNotClobberTheme(t *testing.T) {
	srv, token := themeServer(t)
	if code := putTheme(t, srv, token, "light"); code != http.StatusNoContent && code != http.StatusOK {
		t.Fatalf("PUT theme light: expected 200/204, got %d", code)
	}
	if code := putAccent(t, srv, token, "coral"); code != http.StatusNoContent && code != http.StatusOK {
		t.Fatalf("PUT accent coral: expected 200/204, got %d", code)
	}
	if th := getTheme(t, srv, token); th != "light" {
		t.Errorf("expected theme 'light' to survive setting accent, got %q", th)
	}
}

func TestPreferences_SetThemeDoesNotClobberAccent(t *testing.T) {
	srv, token := themeServer(t)
	if code := putAccent(t, srv, token, "amber"); code != http.StatusNoContent && code != http.StatusOK {
		t.Fatalf("PUT accent amber: expected 200/204, got %d", code)
	}
	if code := putTheme(t, srv, token, "light"); code != http.StatusNoContent && code != http.StatusOK {
		t.Fatalf("PUT theme light: expected 200/204, got %d", code)
	}
	if ac := getAccent(t, srv, token); ac != "amber" {
		t.Errorf("expected accent 'amber' to survive setting theme, got %q", ac)
	}
}
