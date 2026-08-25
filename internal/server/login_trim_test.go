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

// CA2: POST /api/auth/login autentica com sucesso mesmo com espaço sobrando
// no início/fim do username — precedente exato em handleUpdateMe
// (profile.go), que já faz TrimSpace antes de persistir.
func TestLoginTrimsUsername(t *testing.T) {
	t.Run("CA2: espaço no início/fim do username não impede o login", func(t *testing.T) {
		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "u1", "pw", "viewer", false); err != nil {
			t.Fatalf("create user: %v", err)
		}
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)

		body := `{"username":"  u1  ","password":"pw"}`
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			Token string `json:"token"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("decode: %v", err)
		}
		if resp.Token == "" {
			t.Error("esperava um token, veio vazio")
		}
	})
}
