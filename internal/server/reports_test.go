package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEventReportRespectsCameraAccess(t *testing.T) {
	t.Run("CA3: nega acesso (403) quando o usuário não tem a câmera pedida concedida", func(t *testing.T) {
		srv, _, viewerToken := setupRolesServer(t)

		req := httptest.NewRequest(http.MethodGet, "/api/reports/events?camera=cam2", nil)
		req.Header.Set("Authorization", "Bearer "+viewerToken)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for camera not granted, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CA4: libera (200) quando o usuário tem a câmera pedida concedida", func(t *testing.T) {
		srv, _, viewerToken := setupRolesServer(t)

		req := httptest.NewRequest(http.MethodGet, "/api/reports/events?camera=cam1", nil)
		req.Header.Set("Authorization", "Bearer "+viewerToken)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 for granted camera, got %d: %s", w.Code, w.Body.String())
		}
	})
}
