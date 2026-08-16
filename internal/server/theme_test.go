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

func TestPreferences_TelegramActiveReflectsExtensionState(t *testing.T) {
	srv, token := themeServer(t)

	t.Run("CA4: telegram_active é false por padrão", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		var r struct {
			TelegramActive bool `json:"telegram_active"`
		}
		if err := json.NewDecoder(w.Body).Decode(&r); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if r.TelegramActive {
			t.Error("expected telegram_active=false before the extension is activated")
		}
	})

	t.Run("CA4: telegram_active reflete db.SetExtensionActive, mesmo pra um viewer", func(t *testing.T) {
		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "u2", "pw", "viewer", false); err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("set extension active: %v", err)
		}
		srv2 := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
		token2 := loginAndGetToken(t, srv2, "u2", "pw")

		req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
		req.Header.Set("Authorization", "Bearer "+token2)
		w := httptest.NewRecorder()
		srv2.ServeHTTP(w, req)
		var r struct {
			TelegramActive bool `json:"telegram_active"`
		}
		if err := json.NewDecoder(w.Body).Decode(&r); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if !r.TelegramActive {
			t.Error("expected telegram_active=true after SetExtensionActive, even for a non-admin viewer")
		}
	})
}

func TestPreferences_TelegramChatInfo(t *testing.T) {
	t.Run("CA2: telegram_username/telegram_first_name vêm vazios antes de vincular", func(t *testing.T) {
		srv, token := themeServer(t)
		req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		var r struct {
			TelegramUsername  string `json:"telegram_username"`
			TelegramFirstName string `json:"telegram_first_name"`
		}
		if err := json.NewDecoder(w.Body).Decode(&r); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if r.TelegramUsername != "" || r.TelegramFirstName != "" {
			t.Errorf("expected empty telegram_username/telegram_first_name before linking, got username=%q first_name=%q",
				r.TelegramUsername, r.TelegramFirstName)
		}
	})

	t.Run("CA2: telegram_username/telegram_first_name refletem o que foi persistido pelo poller (SetUserTelegramChatInfo)", func(t *testing.T) {
		database := openServerTestDB(t)
		uid, err := db.CreateUser(database, "u2", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
		token := loginAndGetToken(t, srv, "u2", "pw")

		if err := db.SetUserTelegramChatInfo(database, uid, "999", "janedoe", "Jane", "Doe"); err != nil {
			t.Fatalf("SetUserTelegramChatInfo: %v", err)
		}

		req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		var r struct {
			TelegramLinked    bool   `json:"telegram_linked"`
			TelegramUsername  string `json:"telegram_username"`
			TelegramFirstName string `json:"telegram_first_name"`
		}
		if err := json.NewDecoder(w.Body).Decode(&r); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if !r.TelegramLinked || r.TelegramUsername != "janedoe" || r.TelegramFirstName != "Jane" {
			t.Errorf("expected linked=true username=janedoe first_name=Jane, got linked=%v username=%q first_name=%q",
				r.TelegramLinked, r.TelegramUsername, r.TelegramFirstName)
		}
	})

	t.Run("CA2: telegram_bot_username reflete o @username do bot quando a extensão está configurada", func(t *testing.T) {
		srv, token := telegramServer(t, "os_camera_bot")
		req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		var r struct {
			TelegramBotUsername string `json:"telegram_bot_username"`
		}
		if err := json.NewDecoder(w.Body).Decode(&r); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if r.TelegramBotUsername != "os_camera_bot" {
			t.Errorf("expected telegram_bot_username='os_camera_bot', got %q", r.TelegramBotUsername)
		}
	})

	t.Run("CA2: telegram_bot_username fica vazio quando a extensão não está configurada", func(t *testing.T) {
		srv, token := themeServer(t)
		req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		var r struct {
			TelegramBotUsername string `json:"telegram_bot_username"`
		}
		if err := json.NewDecoder(w.Body).Decode(&r); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if r.TelegramBotUsername != "" {
			t.Errorf("expected empty telegram_bot_username without the extension configured, got %q", r.TelegramBotUsername)
		}
	})
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
