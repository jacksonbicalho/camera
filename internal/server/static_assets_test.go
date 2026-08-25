package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"camera/internal/config"
	"camera/internal/server"
)

// TestStaticAssetCache — história fix/lighthouse-hardening. Arquivos sob
// /assets/ (build do Vite) têm hash de conteúdo no nome — seguro cachear
// pra sempre, sem risco de servir uma versão velha. Hoje o Go não seta
// Cache-Control nenhum nesses arquivos (achado do Lighthouse, ~4h de TTL
// efetivo vindo só do default do Cloudflare).
func TestStaticAssetCache(t *testing.T) {
	t.Run("CA6: arquivos sob /assets/ recebem Cache-Control imutável de longo prazo", func(t *testing.T) {
		frontend := fstest.MapFS{
			"index.html":             {Data: []byte("<html/>")},
			"assets/index-abc123.js": {Data: []byte("console.log(1)")},
		}
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), frontend)

		req := httptest.NewRequest(http.MethodGet, "/assets/index-abc123.js", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		got := w.Header().Get("Cache-Control")
		want := "public, max-age=31536000, immutable"
		if got != want {
			t.Errorf("expected Cache-Control %q, got %q", want, got)
		}
	})
}
