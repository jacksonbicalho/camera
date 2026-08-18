package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/server"
)

func setupWithCamera(t *testing.T) (http.Handler, string) {
	t.Helper()
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	cameras := []config.CameraConfig{{ID: "cam1", RTSPURL: "rtsp://fake/cam1"}}
	srv = withTestUsersAndCameras(t, srv, cameras)
	token := loginAndGetToken(t, srv, "admin", "pw")
	return srv, token
}

// CA4: o catálogo de modelos (GET /api/settings/analysis/models) e o aviso
// de elegibilidade de fine-tuning que ele alimentava saem por completo —
// decisão do navigator na análise (o usuário digita qualquer modelo livre
// no cadastro do trainer, sem validação prévia; falhas chegam pelo status
// assíncrono do job, que já tem mensagem amigável pra esse caso).
func TestAnalysisModelsEndpoint_Removed(t *testing.T) {
	srv, token := setupDrivesServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/settings/analysis/models", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("CA4: GET /api/settings/analysis/models = %d, want 404 (rota removida)", w.Code)
	}
}

func TestGetCameraAnalysisConfig_Default(t *testing.T) {
	srv, token := setupWithCamera(t)

	req := httptest.NewRequest(http.MethodGet, "/api/settings/cameras/cam1/analysis", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var result map[string]any
	json.Unmarshal(w.Body.Bytes(), &result)
	// Feedback do navigator na pré-push de fix/camera-analysis-toggle:
	// análise não pode ter default true.
	if result["enabled"] != false {
		t.Errorf("default per-camera enabled = %v, want false", result["enabled"])
	}
}

// TestDetectorPorCamera covers CA2/CA4 of the "object detector selection per
// camera" story. Both assert against JSON decoded into generic maps/structs
// at the HTTP boundary — no new Go symbols from T1/T3 are referenced — so
// they compile against the current handlers and fail as plain assertion
// mismatches (fields silently ignored/still present today), not as compile
// errors.
func TestDetectorPorCamera(t *testing.T) {
	t.Run("CA2: config de análise por câmera persiste detector_id e confidence_threshold", func(t *testing.T) {
		srv, token := setupWithCamera(t)

		createBody := `{"name":"YOLOv8-nano","config":{"service_url":"http://yolo:8001","model":"yolov8n"}}`
		createReq := httptest.NewRequest(http.MethodPost, "/api/settings/detectors", bytes.NewBufferString(createBody))
		createReq.Header.Set("Authorization", "Bearer "+token)
		createReq.Header.Set("Content-Type", "application/json")
		createW := httptest.NewRecorder()
		srv.ServeHTTP(createW, createReq)
		if createW.Code != http.StatusOK && createW.Code != http.StatusCreated {
			t.Fatalf("create detector: expected 200/201, got %d: %s", createW.Code, createW.Body.String())
		}
		var created map[string]any
		if err := json.Unmarshal(createW.Body.Bytes(), &created); err != nil {
			t.Fatalf("unmarshal create response: %v", err)
		}
		detectorID := created["id"]

		body, _ := json.Marshal(map[string]any{
			"enabled":              true,
			"detector_id":          detectorID,
			"confidence_threshold": 0.55,
		})
		req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/cam1/analysis", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("PUT: expected 200, got %d: %s", w.Code, w.Body.String())
		}

		req2 := httptest.NewRequest(http.MethodGet, "/api/settings/cameras/cam1/analysis", nil)
		req2.Header.Set("Authorization", "Bearer "+token)
		w2 := httptest.NewRecorder()
		srv.ServeHTTP(w2, req2)
		if w2.Code != http.StatusOK {
			t.Fatalf("GET: expected 200, got %d: %s", w2.Code, w2.Body.String())
		}

		var result map[string]any
		if err := json.Unmarshal(w2.Body.Bytes(), &result); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		detID, _ := result["detector_id"].(float64)
		if int64(detID) != int64(detectorID.(float64)) {
			t.Errorf("detector_id = %v, want %v", result["detector_id"], detectorID)
		}
		threshold, _ := result["confidence_threshold"].(float64)
		if threshold != 0.55 {
			t.Errorf("confidence_threshold = %v, want 0.55", result["confidence_threshold"])
		}
	})
}

func TestUpdateCameraAnalysisConfig(t *testing.T) {
	srv, token := setupWithCamera(t)

	body := `{"enabled":false}`
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/cam1/analysis", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	req2 := httptest.NewRequest(http.MethodGet, "/api/settings/cameras/cam1/analysis", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	srv.ServeHTTP(w2, req2)

	var result map[string]any
	json.Unmarshal(w2.Body.Bytes(), &result)
	if result["enabled"] != false {
		t.Errorf("enabled should be false after update, got %v", result["enabled"])
	}
}
