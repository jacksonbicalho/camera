package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/server"
)

func setupExtensionsServer(t *testing.T, ext config.ExtensionsConfig) (http.Handler, string) {
	t.Helper()
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	srv = withTestUsers(t, srv)
	srv.WithExtensionsConfig(ext)
	token := loginAndGetToken(t, srv, "admin", "pw")
	return srv, token
}

type extensionsConfigDTO struct {
	TelegramEnabled   bool `json:"telegram_enabled"`
	TelegramAvailable bool `json:"telegram_available"`
}

func TestExtensionsConfig(t *testing.T) {
	t.Run("CA5: GET/PUT /api/settings/extensions persistem telegram_enabled e refletem telegram_available", func(t *testing.T) {
		t.Run("telegram_available é false sem BotToken configurado", func(t *testing.T) {
			srv, token := setupExtensionsServer(t, config.ExtensionsConfig{})

			req := httptest.NewRequest(http.MethodGet, "/api/settings/extensions", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			srv.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
			}
			var got extensionsConfigDTO
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if got.TelegramAvailable {
				t.Error("expected telegram_available=false without BotToken")
			}
			if got.TelegramEnabled {
				t.Error("expected telegram_enabled=false by default")
			}
		})

		t.Run("telegram_available é true quando BotToken está configurado", func(t *testing.T) {
			srv, token := setupExtensionsServer(t, config.ExtensionsConfig{
				Telegram: config.TelegramConfig{BotToken: "some-token"},
			})

			req := httptest.NewRequest(http.MethodGet, "/api/settings/extensions", nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			srv.ServeHTTP(w, req)

			var got extensionsConfigDTO
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if !got.TelegramAvailable {
				t.Error("expected telegram_available=true with BotToken configured")
			}
		})

		t.Run("PUT persiste telegram_enabled, refletido no GET seguinte", func(t *testing.T) {
			srv, token := setupExtensionsServer(t, config.ExtensionsConfig{
				Telegram: config.TelegramConfig{BotToken: "some-token"},
			})

			body, _ := json.Marshal(extensionsConfigDTO{TelegramEnabled: true})
			putReq := httptest.NewRequest(http.MethodPut, "/api/settings/extensions", bytes.NewReader(body))
			putReq.Header.Set("Authorization", "Bearer "+token)
			putReq.Header.Set("Content-Type", "application/json")
			putW := httptest.NewRecorder()
			srv.ServeHTTP(putW, putReq)
			if putW.Code != http.StatusOK {
				t.Fatalf("PUT: expected 200, got %d: %s", putW.Code, putW.Body.String())
			}

			getReq := httptest.NewRequest(http.MethodGet, "/api/settings/extensions", nil)
			getReq.Header.Set("Authorization", "Bearer "+token)
			getW := httptest.NewRecorder()
			srv.ServeHTTP(getW, getReq)
			var got extensionsConfigDTO
			if err := json.Unmarshal(getW.Body.Bytes(), &got); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if !got.TelegramEnabled {
				t.Error("expected telegram_enabled=true after PUT")
			}
		})
	})
}
