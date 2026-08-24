package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/server"
)

// TestForceReloadOnStaleBuild — história feat/forcar-atualizacao-app-ao-reabrir.
// index.html precisa de Cache-Control: no-cache pra que o reload disparado
// pelo hook useForceReloadOnStaleBuild (frontend) realmente busque HTML
// fresco em vez de servir uma cópia em cache no meio do caminho — ver
// spaHandler (internal/server/server.go).
func TestForceReloadOnStaleBuild(t *testing.T) {
	t.Run("CA3: GET / (index.html via spaHandler) inclui Cache-Control: no-cache, must-revalidate", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), minimalFrontend())

		req := httptest.NewRequest(http.MethodGet, "/", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		got := w.Header().Get("Cache-Control")
		if got != "no-cache, must-revalidate" {
			t.Errorf("expected Cache-Control %q, got %q", "no-cache, must-revalidate", got)
		}
	})
}
