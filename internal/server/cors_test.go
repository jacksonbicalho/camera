package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/server"
)

func TestCORSPreflightOnAPIPath(t *testing.T) {
	cfg := config.ServerConfig{}
	srv := server.NewServer(cfg, "UTC", []config.CameraConfig{}, discardLogger(), nil)

	req := httptest.NewRequest(http.MethodOptions, "/api/cameras", nil)
	req.Header.Set("Origin", "https://example.com")
	req.Header.Set("Access-Control-Request-Method", "GET")
	w := httptest.NewRecorder()

	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected Access-Control-Allow-Origin=*, got %q", got)
	}
	if got := w.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Fatalf("expected Access-Control-Allow-Headers to be set")
	}
	if got := w.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Fatalf("expected Access-Control-Allow-Methods to be set")
	}
}

func TestCORSHeaderOnRegularAPIResponse(t *testing.T) {
	cfg := config.ServerConfig{}
	srv := server.NewServer(cfg, "UTC", []config.CameraConfig{}, discardLogger(), nil)

	// Sem token — a resposta é 401, mas o header de CORS precisa estar
	// presente mesmo assim, senão o browser bloqueia o JS de sequer ler o erro.
	req := httptest.NewRequest(http.MethodGet, "/api/cameras", nil)
	req.Header.Set("Origin", "https://example.com")
	w := httptest.NewRecorder()

	srv.ServeHTTP(w, req)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected Access-Control-Allow-Origin=*, got %q", got)
	}
}

func TestCORSNotAppliedOutsideAPIPrefix(t *testing.T) {
	cfg := config.ServerConfig{}
	srv := server.NewServer(cfg, "UTC", []config.CameraConfig{}, discardLogger(), nil)

	req := httptest.NewRequest(http.MethodGet, "/stream/entrada/index.m3u8", nil)
	req.Header.Set("Origin", "https://example.com")
	w := httptest.NewRecorder()

	srv.ServeHTTP(w, req)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no CORS header outside /api/, got %q", got)
	}
}
