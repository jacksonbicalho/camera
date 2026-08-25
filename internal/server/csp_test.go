package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/server"
)

// TestContentSecurityPolicy — história fix/lighthouse-hardening. worker-src
// blob: é necessário porque hls.js (enableWorker default) cria seu Web
// Worker via URL.createObjectURL — sem isso o fallback HLS quebra
// silenciosamente. style-src 'unsafe-inline' é necessário porque
// react-grid-layout (grid do Live View) posiciona os tiles via style=""
// inline (transform/width/height computados em runtime pelo drag).
func TestContentSecurityPolicy(t *testing.T) {
	t.Run("CA8: toda resposta inclui a CSP esperada, incluindo worker-src blob: pro hls.js", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), minimalFrontend())

		req := httptest.NewRequest(http.MethodGet, "/", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		want := "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
			"img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; " +
			"worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; " +
			"form-action 'self'; object-src 'none'"
		if got := w.Header().Get("Content-Security-Policy"); got != want {
			t.Errorf("expected CSP %q, got %q", want, got)
		}
	})
}
