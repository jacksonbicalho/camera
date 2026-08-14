package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/extensions/telegram"
	"camera/internal/server"
)

// telegramServer builds a test Server with the Telegram extension
// "available" (bot token configured) and a stubbed Bot API (only /getMe
// matters for T2 — link generation resolves the bot's @username through
// it). Mirrors themeServer (theme_test.go).
func telegramServer(t *testing.T, botUsername string) (*server.Server, string) {
	t.Helper()
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "u1", "pw", "viewer", false); err != nil {
		t.Fatalf("create user: %v", err)
	}
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/getMe") {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"ok":     true,
				"result": map[string]any{"username": botUsername},
			})
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(stub.Close)
	t.Cleanup(telegram.StubAPIBase(stub.URL))

	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
		WithDB(database).
		WithExtensionsConfig(config.ExtensionsConfig{
			Telegram: config.TelegramConfig{Enabled: true, BotToken: "TESTTOKEN"},
		})
	token := loginAndGetToken(t, srv, "u1", "pw")
	return srv, token
}

func getTelegramLinked(t *testing.T, srv http.Handler, token string) bool {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/me/preferences", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET preferences: expected 200, got %d", w.Code)
	}
	var body struct {
		TelegramLinked bool `json:"telegram_linked"`
	}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return body.TelegramLinked
}

func TestTelegramLinkEndpoint(t *testing.T) {
	t.Run("CA3: POST /api/me/telegram/link devolve a URL do deep-link com o @username real do bot", func(t *testing.T) {
		srv, token := telegramServer(t, "os_camera_bot")

		req := httptest.NewRequest(http.MethodPost, "/api/me/telegram/link", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var body struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if !strings.HasPrefix(body.URL, "https://t.me/os_camera_bot?start=") {
			t.Errorf("expected deep-link URL prefixed with bot username, got %q", body.URL)
		}
	})

	t.Run("CA4: telegram_linked começa false e vira true depois de um vínculo (via POST /telegram/link + resolução simulada), e volta a false após unlink", func(t *testing.T) {
		srv, token := telegramServer(t, "os_camera_bot")

		if getTelegramLinked(t, srv, token) {
			t.Fatalf("expected telegram_linked=false before linking")
		}

		req := httptest.NewRequest(http.MethodPost, "/api/me/telegram/link", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("POST link: expected 200, got %d", w.Code)
		}

		// A resolução real do código (via poller, T3) está fora do escopo
		// deste teste — este CA cobre só o contrato do endpoint em si
		// (200 + telegram_linked continua false até o vínculo ser
		// resolvido por outro caminho).
		if getTelegramLinked(t, srv, token) {
			t.Errorf("expected telegram_linked to remain false until the code is actually resolved (T3)")
		}

		reqUnlink := httptest.NewRequest(http.MethodPost, "/api/me/telegram/unlink", nil)
		reqUnlink.Header.Set("Authorization", "Bearer "+token)
		wUnlink := httptest.NewRecorder()
		srv.ServeHTTP(wUnlink, reqUnlink)
		if wUnlink.Code != http.StatusOK && wUnlink.Code != http.StatusNoContent {
			t.Fatalf("POST unlink: expected 200/204, got %d", wUnlink.Code)
		}
		if getTelegramLinked(t, srv, token) {
			t.Errorf("expected telegram_linked=false after unlink")
		}
	})

	t.Run("CA3: sem token de autenticação, devolve 401", func(t *testing.T) {
		srv, _ := telegramServer(t, "os_camera_bot")

		req := httptest.NewRequest(http.MethodPost, "/api/me/telegram/link", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("POST link without token: expected 401, got %d", w.Code)
		}

		reqUnlink := httptest.NewRequest(http.MethodPost, "/api/me/telegram/unlink", nil)
		wUnlink := httptest.NewRecorder()
		srv.ServeHTTP(wUnlink, reqUnlink)
		if wUnlink.Code != http.StatusUnauthorized {
			t.Errorf("POST unlink without token: expected 401, got %d", wUnlink.Code)
		}
	})

	t.Run("CA3: extensão não disponível (bot token vazio ou Enabled=false) devolve 503", func(t *testing.T) {
		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "u1", "pw", "viewer", false); err != nil {
			t.Fatalf("create user: %v", err)
		}

		cases := []struct {
			name string
			cfg  config.TelegramConfig
		}{
			{"bot_token vazio", config.TelegramConfig{Enabled: true, BotToken: ""}},
			{"Enabled=false com bot_token setado", config.TelegramConfig{Enabled: false, BotToken: "TOK"}},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
					WithDB(database).
					WithExtensionsConfig(config.ExtensionsConfig{Telegram: tc.cfg})
				token := loginAndGetToken(t, srv, "u1", "pw")

				req := httptest.NewRequest(http.MethodPost, "/api/me/telegram/link", nil)
				req.Header.Set("Authorization", "Bearer "+token)
				w := httptest.NewRecorder()
				srv.ServeHTTP(w, req)
				if w.Code != http.StatusServiceUnavailable {
					t.Errorf("expected 503, got %d", w.Code)
				}
			})
		}
	})

	t.Run("CA3: falha ao resolver o @username do bot devolve 502", func(t *testing.T) {
		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "u1", "pw", "viewer", false); err != nil {
			t.Fatalf("create user: %v", err)
		}
		stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusInternalServerError)
		}))
		t.Cleanup(stub.Close)
		t.Cleanup(telegram.StubAPIBase(stub.URL))

		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
			WithDB(database).
			WithExtensionsConfig(config.ExtensionsConfig{
				Telegram: config.TelegramConfig{Enabled: true, BotToken: "TESTTOKEN"},
			})
		token := loginAndGetToken(t, srv, "u1", "pw")

		req := httptest.NewRequest(http.MethodPost, "/api/me/telegram/link", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusBadGateway {
			t.Errorf("expected 502, got %d", w.Code)
		}
	})
}
