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

// TestEventLabelRoutesRemoved cobre a história chore/remover-analise-objetos (T2)
// — as rotas de rotulagem manual de evento saem junto com internal/server/event_label.go,
// mas GET /api/events/{id} continua registrada (usada por useRecordingSegments.ts,
// fora do escopo de rotulagem).
func TestEventLabelRoutesRemoved(t *testing.T) {
	t.Run("CA3: rotas de rotulagem manual de evento removidas — 404 padrão do mux; GET /api/events/{id} preservada", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{}, discardLogger(), nil)

		removed := []struct {
			method string
			path   string
		}{
			{http.MethodPatch, "/api/events/1/label"},
			{http.MethodPut, "/api/events/1/frame"},
			{http.MethodPatch, "/api/events/bulk/dismiss"},
			{http.MethodPatch, "/api/events/bulk/label"},
			{http.MethodGet, "/api/cameras/cam1/events"},
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

		// DELETE /api/events/bulk é um caso à parte: o segmento literal "bulk"
		// colide com o wildcard de GET /api/events/{id} (rota preservada) —
		// o path CASA com um padrão registrado, só não com esse método, então
		// o mux responde 405 (Method Not Allowed), não o 404 padrão de rota
		// nunca registrada.
		req := httptest.NewRequest(http.MethodDelete, "/api/events/bulk", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusMethodNotAllowed {
			t.Errorf("DELETE /api/events/bulk: esperado 405 (colide com GET /api/events/{id}), got status %d body %q", w.Code, w.Body.String())
		}

		req = httptest.NewRequest(http.MethodGet, "/api/events/1", nil)
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Body.String() == "404 page not found\n" {
			t.Errorf("GET /api/events/1 não deveria cair no 404 padrão do mux (rota deve continuar registrada), got body %q", w.Body.String())
		}
	})
}
