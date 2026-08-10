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

// retention_extensions_test.go substitui drives_test.go (história
// feat/extensoes-generalizadas-s3-extensao, T3): a tabela `drives` vira
// `retention_extensions`, tratada como singleton (0 ou 1 linha) — S3 passa a
// ser uma extensão, não múltiplos destinos nomeados (decisão do navigator
// registrada na análise). `drive_id` vira `retention_extension_id` em toda
// parte (retention_config incluído). As rotas usadas aqui (/api/retention-extensions)
// ainda não existem — CA4 red phase.

func setupDrivesServer(t *testing.T) (http.Handler, string) {
	t.Helper()
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	srv = withTestUsers(t, srv)
	token := loginAndGetToken(t, srv, "admin", "pw")
	return srv, token
}

func TestListRetentionExtensions_Empty(t *testing.T) {
	srv, token := setupDrivesServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/retention-extensions", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var list []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected empty list, got %d", len(list))
	}
}

func createRetentionExtension(t *testing.T, srv http.Handler, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/retention-extensions", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w
}

func TestCreateRetentionExtension_MissingFields(t *testing.T) {
	srv, token := setupDrivesServer(t)

	w := createRetentionExtension(t, srv, token, `{"name":"test"}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", w.Code, w.Body.String())
	}
}

// CA4: migração renomeia drives→retention_extensions preservando o CRUD
// (create/delete continuam funcionando); POST rejeita (409) uma 2ª criação
// enquanto já existe uma linha — S3 é singleton agora.
func TestCreateRetentionExtension_SingletonEnforced(t *testing.T) {
	t.Run("CA4: POST /api/retention-extensions rejeita (409) uma 2ª criação enquanto já existe uma linha", func(t *testing.T) {
		srv, token := setupDrivesServer(t)

		body := `{"name":"my-s3","bucket":"my-bucket","region":"us-east-1","access_key":"AK","secret_key":"SK"}`
		w := createRetentionExtension(t, srv, token, body)
		if w.Code != http.StatusCreated {
			t.Fatalf("1º create: expected 201, got %d: %s", w.Code, w.Body.String())
		}
		var created map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("unmarshal created: %v", err)
		}
		id, _ := created["id"].(string)
		if id == "" {
			t.Fatal("expected non-empty id")
		}
		if _, ok := created["access_key"]; ok {
			t.Error("access_key should not be in response")
		}
		if _, ok := created["secret_key"]; ok {
			t.Error("secret_key should not be in response")
		}

		w = createRetentionExtension(t, srv, token, `{"name":"outro","bucket":"b2","region":"us-east-1","access_key":"AK2","secret_key":"SK2"}`)
		if w.Code != http.StatusConflict {
			t.Fatalf("2º create: expected 409, got %d: %s", w.Code, w.Body.String())
		}

		// Excluir libera o singleton de novo.
		req := httptest.NewRequest(http.MethodDelete, "/api/retention-extensions/"+id, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusNoContent {
			t.Fatalf("delete: expected 204, got %d", w.Code)
		}

		w = createRetentionExtension(t, srv, token, body)
		if w.Code != http.StatusCreated {
			t.Fatalf("create após delete: expected 201, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestDeleteRetentionExtension_ResetsRetentionConfig(t *testing.T) {
	srv, token := setupDrivesServer(t)

	body := `{"name":"s3-ext","bucket":"bkt","region":"us-east-1","access_key":"AK","secret_key":"SK"}`
	w := createRetentionExtension(t, srv, token, body)
	if w.Code != http.StatusCreated {
		t.Fatalf("create: %d", w.Code)
	}
	var created map[string]any
	json.Unmarshal(w.Body.Bytes(), &created)
	id := created["id"].(string)

	// Point retention at that extension — CA4: o campo é retention_extension_id agora.
	retBody := `{"action":"send_to_drive","retention_extension_id":"` + id + `"}`
	req := httptest.NewRequest(http.MethodPut, "/api/retention/with_motion", bytes.NewBufferString(retBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("set retention: %d: %s", w.Code, w.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/retention-extensions/"+id, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", w.Code)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/retention", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	var configs []map[string]any
	json.Unmarshal(w.Body.Bytes(), &configs)
	for _, rc := range configs {
		if rc["category"] == "with_motion" {
			if rc["action"] != "delete" {
				t.Errorf("with_motion action = %q after extension deletion, want delete", rc["action"])
			}
			if rc["retention_extension_id"] != nil && rc["retention_extension_id"] != "" {
				t.Errorf("with_motion retention_extension_id = %v after extension deletion, want empty", rc["retention_extension_id"])
			}
		}
	}
}

func TestRetentionConfig_Defaults(t *testing.T) {
	srv, token := setupDrivesServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/retention", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var configs []map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &configs); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(configs) != 2 {
		t.Fatalf("expected 2 configs, got %d", len(configs))
	}
	for _, rc := range configs {
		if rc["action"] != "delete" {
			t.Errorf("category %q: default action = %q, want delete", rc["category"], rc["action"])
		}
	}
}

func TestUpdateRetentionConfig_InvalidCategory(t *testing.T) {
	srv, token := setupDrivesServer(t)

	body := `{"action":"delete"}`
	req := httptest.NewRequest(http.MethodPut, "/api/retention/unknown", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestRetentionExtensions_ForbiddenForViewer(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "vwr", "vwrpw", "viewer", false); err != nil {
		t.Fatalf("add viewer: %v", err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
	viewerToken := loginAndGetToken(t, srv, "vwr", "vwrpw")

	for _, path := range []string{"/api/retention-extensions", "/api/retention"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+viewerToken)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusForbidden {
			t.Errorf("GET %s: expected 403 for viewer, got %d", path, w.Code)
		}
	}
}
