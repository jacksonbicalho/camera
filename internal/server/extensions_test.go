package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
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

func TestExtensionsListed_S3(t *testing.T) {
	t.Run("CA5: a extensão s3 aparece na lista com category=retention e available conforme extensions.s3.enabled", func(t *testing.T) {
		t.Run("available=false quando extensions.s3.enabled=false", func(t *testing.T) {
			srv, token := setupExtensionsServer(t, config.ExtensionsConfig{})
			list := getExtensions(t, srv, token)
			s3ext, ok := findExtension(list, "s3")
			if !ok {
				t.Fatalf("esperava a extensão s3 na lista, got %+v", list)
			}
			if s3ext.Category != "Retenção" {
				t.Errorf("category = %q, want Retenção", s3ext.Category)
			}
			if s3ext.Available {
				t.Error("expected available=false with extensions.s3.enabled=false")
			}
		})

		t.Run("available=true quando extensions.s3.enabled=true", func(t *testing.T) {
			srv, token := setupExtensionsServer(t, config.ExtensionsConfig{
				S3: config.S3ExtensionConfig{Enabled: true},
			})
			list := getExtensions(t, srv, token)
			s3ext, ok := findExtension(list, "s3")
			if !ok {
				t.Fatalf("esperava a extensão s3 na lista, got %+v", list)
			}
			if !s3ext.Available {
				t.Error("expected available=true with extensions.s3.enabled=true")
			}
		})
	})
}

// TestSyncExtensionsFromConfig cobre a história
// fix/sync-extensao-active-boot-camera-yaml: no boot, camera.yaml deve
// prevalecer sobre o toggle "Ativado" persistido em system_config, nos
// dois sentidos — inclusive religando uma extensão que o admin tinha
// desligado manualmente pela UI, se o yaml disser enabled: true (decisão
// do navigator, ver work_progress/analysis).
func TestSyncExtensionsFromConfig(t *testing.T) {
	t.Run("CA2: yaml enabled=false força Active=false mesmo partindo de true no banco", func(t *testing.T) {
		database := openServerTestDB(t)
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("seed active=true: %v", err)
		}
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
			WithExtensionsConfig(config.ExtensionsConfig{
				Telegram: config.TelegramConfig{Enabled: false},
			}).
			WithDB(database)

		if err := srv.SyncExtensionsFromConfig(); err != nil {
			t.Fatalf("SyncExtensionsFromConfig: %v", err)
		}

		active, err := db.GetExtensionActive(database, "telegram")
		if err != nil {
			t.Fatalf("GetExtensionActive: %v", err)
		}
		if active {
			t.Error("esperava active=false depois do sync (yaml enabled=false), got true")
		}
	})

	t.Run("CA2: yaml enabled=true (+ bot token) força Active=true mesmo partindo de false no banco", func(t *testing.T) {
		database := openServerTestDB(t)
		if err := db.SetExtensionActive(database, "telegram", false); err != nil {
			t.Fatalf("seed active=false: %v", err)
		}
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
			WithExtensionsConfig(config.ExtensionsConfig{
				Telegram: config.TelegramConfig{Enabled: true, BotToken: "tok"},
			}).
			WithDB(database)

		if err := srv.SyncExtensionsFromConfig(); err != nil {
			t.Fatalf("SyncExtensionsFromConfig: %v", err)
		}

		active, err := db.GetExtensionActive(database, "telegram")
		if err != nil {
			t.Fatalf("GetExtensionActive: %v", err)
		}
		if !active {
			t.Error("esperava active=true depois do sync (yaml enabled=true + bot token), got false")
		}
	})

	t.Run("CA2: sem DB configurado, não quebra o boot (no-op)", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
			WithExtensionsConfig(config.ExtensionsConfig{
				Telegram: config.TelegramConfig{Enabled: true, BotToken: "tok"},
			})

		if err := srv.SyncExtensionsFromConfig(); err != nil {
			t.Errorf("esperava nil sem DB configurado, got %v", err)
		}
	})
}
