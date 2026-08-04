package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
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

func TestGetAnalysisConfig_Default(t *testing.T) {
	srv, token := setupDrivesServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/settings/analysis", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var cfg db.VideoAnalysisConfig
	if err := json.Unmarshal(w.Body.Bytes(), &cfg); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if cfg.Model != "yolov8n" {
		t.Errorf("default model = %q, want yolov8n", cfg.Model)
	}
}

func TestUpdateAnalysisConfig(t *testing.T) {
	srv, token := setupDrivesServer(t)

	body := `{"service_url":"http://yolo:8000","model":"yolov8s"}`
	req := httptest.NewRequest(http.MethodPut, "/api/settings/analysis", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	req2 := httptest.NewRequest(http.MethodGet, "/api/settings/analysis", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	srv.ServeHTTP(w2, req2)

	var cfg db.VideoAnalysisConfig
	json.Unmarshal(w2.Body.Bytes(), &cfg)
	if cfg.ServiceURL != "http://yolo:8000" {
		t.Errorf("ServiceURL = %q, want http://yolo:8000", cfg.ServiceURL)
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
	if result["enabled"] != true {
		t.Errorf("default per-camera enabled = %v, want true", result["enabled"])
	}
}

func TestGetAnalysisConfig_HasCustomModelDefault(t *testing.T) {
	srv, token := setupDrivesServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/settings/analysis", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	var cfg db.VideoAnalysisConfig
	json.Unmarshal(w.Body.Bytes(), &cfg)
	if cfg.HasCustomModel {
		t.Error("HasCustomModel should be false by default")
	}
}

func TestFinetuneStatus_SetsHasCustomModelOnCompletion(t *testing.T) {
	// Mock YOLO service that returns status=completed.
	yolo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"done","epoch":20,"total_epochs":20}`))
	}))
	defer yolo.Close()

	srv, token := setupDrivesServer(t)

	// Configure the analysis service URL to point to our mock.
	cfgBody, _ := json.Marshal(map[string]any{
		"enabled":     true,
		"service_url": yolo.URL,
		"model":       "yolov8n",
	})
	req := httptest.NewRequest(http.MethodPut, "/api/settings/analysis", bytes.NewReader(cfgBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	httptest.NewRecorder() // discard
	srv.ServeHTTP(httptest.NewRecorder(), req)

	// Call finetune status — should set has_custom_model=true.
	req2 := httptest.NewRequest(http.MethodGet, "/api/settings/analysis/finetune/status/job123", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	w2 := httptest.NewRecorder()
	srv.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w2.Code, w2.Body.String())
	}

	// Config should now have has_custom_model=true.
	req3 := httptest.NewRequest(http.MethodGet, "/api/settings/analysis", nil)
	req3.Header.Set("Authorization", "Bearer "+token)
	w3 := httptest.NewRecorder()
	srv.ServeHTTP(w3, req3)

	var cfg db.VideoAnalysisConfig
	json.Unmarshal(w3.Body.Bytes(), &cfg)
	if !cfg.HasCustomModel {
		t.Error("HasCustomModel should be true after finetune completes")
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

	t.Run("CA4: configuração global de análise não expõe mais habilitar nem limiar de confiança", func(t *testing.T) {
		srv, token := setupDrivesServer(t)

		req := httptest.NewRequest(http.MethodGet, "/api/settings/analysis", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var result map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if _, ok := result["enabled"]; ok {
			t.Errorf("resposta da config global não deveria mais ter 'enabled', got %v", result)
		}
		if _, ok := result["confidence_threshold"]; ok {
			t.Errorf("resposta da config global não deveria mais ter 'confidence_threshold', got %v", result)
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
