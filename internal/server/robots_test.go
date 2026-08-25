package server_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"camera/internal/config"
	"camera/internal/server"
)

// TestRobotsTxt — história fix/lighthouse-hardening. Sem uma rota dedicada,
// GET /robots.txt caía no catch-all da SPA e devolvia index.html (HTML) —
// achado do Lighthouse. Sistema privado (câmeras domésticas): o correto é
// negar indexação explicitamente.
func TestRobotsTxt(t *testing.T) {
	t.Run("CA5: GET /robots.txt devolve text/plain com Disallow: /", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), minimalFrontend())

		req := httptest.NewRequest(http.MethodGet, "/robots.txt", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
			t.Errorf("expected Content-Type text/plain, got %q", ct)
		}
		body := w.Body.String()
		if !strings.Contains(body, "Disallow: /") {
			t.Errorf("expected body to contain %q, got %q", "Disallow: /", body)
		}
	})
}
