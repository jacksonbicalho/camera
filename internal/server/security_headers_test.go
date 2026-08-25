package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/server"
)

// TestSecurityHeaders — história fix/lighthouse-hardening. Sistema exposto
// publicamente (domínio + TLS próprios); sem X-Frame-Options/HSTS/etc a
// tela de login é embutível em <iframe> de terceiros (clickjacking).
func TestSecurityHeaders(t *testing.T) {
	t.Run("CA7: toda resposta inclui os headers de segurança de baixo risco", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), minimalFrontend())

		req := httptest.NewRequest(http.MethodGet, "/", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		cases := map[string]string{
			"Strict-Transport-Security":  "max-age=31536000; includeSubDomains",
			"X-Content-Type-Options":     "nosniff",
			"Referrer-Policy":            "strict-origin-when-cross-origin",
			"X-Frame-Options":            "DENY",
			"Cross-Origin-Opener-Policy": "same-origin",
		}
		for header, want := range cases {
			if got := w.Header().Get(header); got != want {
				t.Errorf("%s: expected %q, got %q", header, want, got)
			}
		}
	})
}
