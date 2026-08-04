package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestObjectDetectors covers CA3/CA4. Both hit routes that don't exist yet
// (T2/T3 pending) — the mux returns 404, a clean assertion failure, not a
// compile error (no new symbols are referenced from internal/server here).
func TestObjectDetectors(t *testing.T) {
	t.Run("CA3: CRUD REST de object detectors (list/create/update/delete) via /api/settings/detectors", func(t *testing.T) {
		srv, token := setupDrivesServer(t)

		createBody := `{"name":"YOLOv8-nano","config":{"service_url":"http://yolo:8001","model":"yolov8n","confidence_threshold":"0.4"}}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/detectors", bytes.NewBufferString(createBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK && w.Code != http.StatusCreated {
			t.Fatalf("create: expected 200/201, got %d: %s", w.Code, w.Body.String())
		}
		var created map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("unmarshal create response: %v", err)
		}
		id := created["id"]

		req = httptest.NewRequest(http.MethodGet, "/api/settings/detectors", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("list: expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var list []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
			t.Fatalf("unmarshal list: %v", err)
		}
		if len(list) != 1 {
			t.Fatalf("expected 1 detector listed, got %d", len(list))
		}

		updateBody := `{"name":"YOLOv8-nano v2","config":{"service_url":"http://yolo:9001","model":"yolov8n","confidence_threshold":"0.5"}}`
		req = httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/settings/detectors/%v", id), bytes.NewBufferString(updateBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("update: expected 200, got %d: %s", w.Code, w.Body.String())
		}

		req = httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/settings/detectors/%v", id), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK && w.Code != http.StatusNoContent {
			t.Fatalf("delete: expected 200/204, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CA4: endpoint de teste roda a inferência via upload multipart e devolve as detecções", func(t *testing.T) {
		yolo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/analyze" {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"detections":[{"label":"person","confidence":0.92,"frame_count":1}]}`))
		}))
		defer yolo.Close()

		srv, token := setupDrivesServer(t)

		createBody := fmt.Sprintf(`{"name":"YOLOv8-nano","config":{"service_url":%q,"model":"yolov8n","confidence_threshold":"0.4"}}`, yolo.URL)
		req := httptest.NewRequest(http.MethodPost, "/api/settings/detectors", bytes.NewBufferString(createBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK && w.Code != http.StatusCreated {
			t.Fatalf("create: expected 200/201, got %d: %s", w.Code, w.Body.String())
		}
		var created map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &created)
		id := created["id"]

		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		fw, err := mw.CreateFormFile("file", "test.jpg")
		if err != nil {
			t.Fatalf("CreateFormFile: %v", err)
		}
		if _, err := fw.Write([]byte("fake-image-bytes")); err != nil {
			t.Fatalf("write form file: %v", err)
		}
		if err := mw.Close(); err != nil {
			t.Fatalf("close multipart writer: %v", err)
		}

		req = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/settings/detectors/%v/test", id), &buf)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("test: expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var result struct {
			Detections []struct {
				Label string `json:"label"`
			} `json:"detections"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatalf("unmarshal test response: %v", err)
		}
		if len(result.Detections) != 1 || result.Detections[0].Label != "person" {
			t.Fatalf("expected 1 detection labeled person, got %+v", result.Detections)
		}
	})

	// CA9 (história feat/detector-por-camera): a tela de teste manda um limiar
	// avulso no multipart — precisa vencer o valor salvo no detector, nunca o
	// contrário.
	t.Run("CA9: limiar recebido no multipart do teste sobrepõe o salvo no detector", func(t *testing.T) {
		var gotThreshold float64
		yolo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var body struct {
				ConfidenceThreshold float64 `json:"confidence_threshold"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			gotThreshold = body.ConfidenceThreshold
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"detections":[]}`))
		}))
		defer yolo.Close()

		srv, token := setupDrivesServer(t)

		createBody := fmt.Sprintf(`{"name":"YOLOv8-nano","config":{"service_url":%q,"model":"yolov8n","confidence_threshold":"0.4"}}`, yolo.URL)
		req := httptest.NewRequest(http.MethodPost, "/api/settings/detectors", bytes.NewBufferString(createBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		var created map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &created)
		id := created["id"]

		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		if err := mw.WriteField("confidence_threshold", "0.7"); err != nil {
			t.Fatalf("WriteField: %v", err)
		}
		fw, err := mw.CreateFormFile("file", "test.jpg")
		if err != nil {
			t.Fatalf("CreateFormFile: %v", err)
		}
		if _, err := fw.Write([]byte("fake-image-bytes")); err != nil {
			t.Fatalf("write form file: %v", err)
		}
		if err := mw.Close(); err != nil {
			t.Fatalf("close multipart writer: %v", err)
		}

		req = httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/settings/detectors/%v/test", id), &buf)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("test: expected 200, got %d: %s", w.Code, w.Body.String())
		}
		if gotThreshold != 0.7 {
			t.Fatalf("expected yolo service to receive confidence_threshold 0.7 (from request), got %v", gotThreshold)
		}
	})
}

// TestDetectorAdapterPattern covers the story feat(analysis): object detector
// adapter pattern (yolo/hugging face).
func TestDetectorAdapterPattern(t *testing.T) {
	t.Run("CA4: criar detector yolo sem service_url é rejeitado", func(t *testing.T) {
		srv, token := setupDrivesServer(t)

		body := `{"name":"Sem URL","type":"yolo","config":{"model":"yolov8n"}}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/detectors", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for yolo detector missing service_url, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CA4: criar detector huggingface sem model_id/api_token é rejeitado", func(t *testing.T) {
		srv, token := setupDrivesServer(t)

		body := `{"name":"Sem token","type":"huggingface","config":{}}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/detectors", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for huggingface detector missing model_id/api_token, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CA5: api_token nunca volta em claro numa resposta HTTP do cadastro", func(t *testing.T) {
		srv, token := setupDrivesServer(t)

		createBody := `{"name":"HF Detector","type":"huggingface","config":{"model_id":"facebook/detr-resnet-50","api_token":"hf_supersecret"}}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/detectors", bytes.NewBufferString(createBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK && w.Code != http.StatusCreated {
			t.Fatalf("create: expected 200/201, got %d: %s", w.Code, w.Body.String())
		}
		var created map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("unmarshal create response: %v", err)
		}
		if cfg, ok := created["config"].(map[string]any); ok {
			if _, leaked := cfg["api_token"]; leaked {
				t.Fatalf("create response leaked api_token: %+v", cfg)
			}
		}

		req = httptest.NewRequest(http.MethodGet, "/api/settings/detectors", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		var list []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
			t.Fatalf("unmarshal list: %v", err)
		}
		if len(list) != 1 {
			t.Fatalf("expected 1 detector listed, got %d", len(list))
		}
		if cfg, ok := list[0]["config"].(map[string]any); ok {
			if _, leaked := cfg["api_token"]; leaked {
				t.Fatalf("list response leaked api_token: %+v", cfg)
			}
		}
	})

	t.Run("CA5: atualizar sem enviar api_token preserva o token já salvo", func(t *testing.T) {
		srv, token := setupDrivesServer(t)

		createBody := `{"name":"HF Detector","type":"huggingface","config":{"model_id":"facebook/detr-resnet-50","api_token":"hf_supersecret"}}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/detectors", bytes.NewBufferString(createBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		var created map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("unmarshal create response: %v", err)
		}
		id := created["id"]

		// No api_token in the update payload at all — validateDetectorConfig
		// would reject this as an incomplete huggingface config (400) unless
		// the handler merged in the token already stored for this detector.
		updateBody := `{"name":"HF Detector v2","type":"huggingface","config":{"model_id":"facebook/detr-resnet-50"}}`
		req = httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/settings/detectors/%v", id), bytes.NewBufferString(updateBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("update without api_token should preserve the stored one and succeed, got %d: %s", w.Code, w.Body.String())
		}
	})
}
