package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func getNotifyEmail(t *testing.T, srv http.Handler, token string) bool {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET preferences: expected 200, got %d", w.Code)
	}
	var r struct {
		NotifyEmail bool `json:"notify_email"`
	}
	if err := json.NewDecoder(w.Body).Decode(&r); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return r.NotifyEmail
}

func putNotifyEmail(t *testing.T, srv http.Handler, token string, enabled bool) int {
	t.Helper()
	body := `{"notify_email":false}`
	if enabled {
		body = `{"notify_email":true}`
	}
	req := httptest.NewRequest(http.MethodPut, "/api/me/preferences", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w.Code
}

func TestPreferences_NotifyEmail(t *testing.T) {
	t.Run("CA7: default é desabilitado", func(t *testing.T) {
		srv, token := themeServer(t)
		if getNotifyEmail(t, srv, token) {
			t.Errorf("expected default notify_email=false")
		}
	})

	t.Run("CA7: PUT notify_email=true não afeta theme/accent, e é lido de volta", func(t *testing.T) {
		srv, token := themeServer(t)
		if code := putTheme(t, srv, token, "light"); code != http.StatusNoContent && code != http.StatusOK {
			t.Fatalf("PUT theme: %d", code)
		}
		if code := putNotifyEmail(t, srv, token, true); code != http.StatusNoContent && code != http.StatusOK {
			t.Fatalf("PUT notify_email: %d", code)
		}
		if !getNotifyEmail(t, srv, token) {
			t.Errorf("expected notify_email=true after PUT")
		}
		if th := getTheme(t, srv, token); th != "light" {
			t.Errorf("expected theme to survive setting notify_email, got %q", th)
		}
	})

	t.Run("CA7: PUT theme não reseta notify_email", func(t *testing.T) {
		srv, token := themeServer(t)
		if code := putNotifyEmail(t, srv, token, true); code != http.StatusNoContent && code != http.StatusOK {
			t.Fatalf("PUT notify_email: %d", code)
		}
		if code := putTheme(t, srv, token, "dark"); code != http.StatusNoContent && code != http.StatusOK {
			t.Fatalf("PUT theme: %d", code)
		}
		if !getNotifyEmail(t, srv, token) {
			t.Errorf("expected notify_email to survive setting theme")
		}
	})
}
