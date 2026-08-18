package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/server"
)

// TestObjectAnalysisRoutesRemoved cobre a história chore/remover-analise-objetos
// (T1) — as rotas de detector/trainer/análise/anotações (dataset de fine-tuning)
// saem da tabela de routes.go; uma request pra qualquer uma delas passa a cair
// no 404 padrão do http.ServeMux ("404 page not found", rota nunca registrada),
// nunca mais no handler antigo.
func TestObjectAnalysisRoutesRemoved(t *testing.T) {
	t.Run("CA2: rotas de detector/trainer/análise/anotações removidas — 404 padrão do mux", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{}, discardLogger(), nil)

		removed := []struct {
			method string
			path   string
		}{
			{http.MethodPost, "/api/settings/analysis/reanalyze"},
			{http.MethodPost, "/api/settings/analysis/finetune"},
			{http.MethodDelete, "/api/settings/analysis/finetune/job1"},
			{http.MethodGet, "/api/settings/analysis/finetune/status/job1"},
			{http.MethodGet, "/api/settings/analysis/annotation-count"},
			{http.MethodGet, "/api/settings/cameras/cam1/analysis"},
			{http.MethodPut, "/api/settings/cameras/cam1/analysis"},
			{http.MethodGet, "/api/settings/detectors"},
			{http.MethodPost, "/api/settings/detectors"},
			{http.MethodPut, "/api/settings/detectors/1"},
			{http.MethodDelete, "/api/settings/detectors/1"},
			{http.MethodPost, "/api/settings/detectors/1/test"},
			{http.MethodGet, "/api/settings/trainers"},
			{http.MethodPost, "/api/settings/trainers"},
			{http.MethodPut, "/api/settings/trainers/1"},
			{http.MethodDelete, "/api/settings/trainers/1"},
			{http.MethodPost, "/api/events/1/annotations"},
			{http.MethodGet, "/api/events/1/annotations"},
			{http.MethodDelete, "/api/events/1/annotations"},
			{http.MethodPatch, "/api/annotations/1"},
			{http.MethodDelete, "/api/annotations/1"},
		}
		for _, r := range removed {
			req := httptest.NewRequest(r.method, r.path, nil)
			w := httptest.NewRecorder()
			srv.ServeHTTP(w, req)
			if w.Code != http.StatusNotFound || w.Body.String() != "404 page not found\n" {
				t.Errorf("%s %s: esperado 404 padrão do mux (rota removida), got status %d body %q",
					r.method, r.path, w.Code, w.Body.String())
			}
		}
	})
}
