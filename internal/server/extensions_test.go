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

// extensionDTO é o formato-alvo (T1 desta história): GET /api/settings/extensions
// passa a devolver uma LISTA em vez do objeto plano {telegram_enabled,
// telegram_available} — cada entrada descreve uma extensão (id/categoria/
// descrição/disponível-no-config/ativada-pelo-usuário). Definido aqui, no
// teste, porque ainda não existe produção nenhuma que o gere (T1 red phase).
type extensionDTO struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Available   bool   `json:"available"`
	Active      bool   `json:"active"`
}

func getExtensions(t *testing.T, srv http.Handler, token string) []extensionDTO {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/settings/extensions", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /api/settings/extensions: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var got []extensionDTO
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal: %v (body: %s)", err, w.Body.String())
	}
	return got
}

func findExtension(list []extensionDTO, id string) (extensionDTO, bool) {
	for _, e := range list {
		if e.ID == id {
			return e, true
		}
	}
	return extensionDTO{}, false
}

func TestExtensionsListed(t *testing.T) {
	t.Run("CA2: GET /api/settings/extensions devolve uma lista incluindo telegram (id/category/description/available/active)", func(t *testing.T) {
		t.Run("telegram vem com available=false sem BotToken configurado", func(t *testing.T) {
			srv, token := setupExtensionsServer(t, config.ExtensionsConfig{})
			list := getExtensions(t, srv, token)
			tg, ok := findExtension(list, "telegram")
			if !ok {
				t.Fatalf("esperava a extensão telegram na lista, got %+v", list)
			}
			if tg.Available {
				t.Error("expected available=false without BotToken")
			}
			if tg.Active {
				t.Error("expected active=false by default")
			}
			if tg.Category == "" || tg.Description == "" {
				t.Errorf("esperava category e description preenchidos, got %+v", tg)
			}
		})

		t.Run("telegram vem com available=true quando Enabled+BotToken estão configurados", func(t *testing.T) {
			srv, token := setupExtensionsServer(t, config.ExtensionsConfig{
				Telegram: config.TelegramConfig{Enabled: true, BotToken: "some-token"},
			})
			list := getExtensions(t, srv, token)
			tg, ok := findExtension(list, "telegram")
			if !ok {
				t.Fatalf("esperava a extensão telegram na lista, got %+v", list)
			}
			if !tg.Available {
				t.Error("expected available=true with Enabled=true and BotToken configured")
			}
		})

		t.Run("telegram vem com available=false com BotToken mas Enabled=false", func(t *testing.T) {
			srv, token := setupExtensionsServer(t, config.ExtensionsConfig{
				Telegram: config.TelegramConfig{Enabled: false, BotToken: "some-token"},
			})
			list := getExtensions(t, srv, token)
			tg, ok := findExtension(list, "telegram")
			if !ok {
				t.Fatalf("esperava a extensão telegram na lista, got %+v", list)
			}
			if tg.Available {
				t.Error("expected available=false when Enabled=false, mesmo com BotToken")
			}
		})
	})

	t.Run("CA3: PUT /api/settings/extensions/{id} altera só a extensão indicada", func(t *testing.T) {
		srv, token := setupExtensionsServer(t, config.ExtensionsConfig{
			Telegram: config.TelegramConfig{Enabled: true, BotToken: "some-token"},
		})

		body, _ := json.Marshal(map[string]bool{"active": true})
		req := httptest.NewRequest(http.MethodPut, "/api/settings/extensions/telegram", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("PUT: expected 200, got %d: %s", w.Code, w.Body.String())
		}

		list := getExtensions(t, srv, token)
		tg, ok := findExtension(list, "telegram")
		if !ok || !tg.Active {
			t.Fatalf("esperava telegram.active=true após o PUT, got %+v", list)
		}
		for _, e := range list {
			if e.ID != "telegram" && e.Active {
				t.Errorf("PUT em telegram não deveria ativar outra extensão, mas %s veio active=true", e.ID)
			}
		}
	})

	t.Run("CA3: PUT /api/settings/extensions/{id} com id inexistente devolve 404 sem gravar nada", func(t *testing.T) {
		srv, token := setupExtensionsServer(t, config.ExtensionsConfig{
			Telegram: config.TelegramConfig{Enabled: true, BotToken: "some-token"},
		})

		body, _ := json.Marshal(map[string]bool{"active": true})
		req := httptest.NewRequest(http.MethodPut, "/api/settings/extensions/inexistente", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d: %s", w.Code, w.Body.String())
		}

		list := getExtensions(t, srv, token)
		for _, e := range list {
			if e.Active {
				t.Errorf("PUT em id inexistente não deveria ativar nenhuma extensão, mas %s veio active=true", e.ID)
			}
		}
	})
}
