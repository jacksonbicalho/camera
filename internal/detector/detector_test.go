package detector_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/analysis"
	"camera/internal/detector"
)

// TestDetectorAdapterPattern covers the story feat(analysis): object detector
// adapter pattern (yolo/hugging face).
func TestDetectorAdapterPattern(t *testing.T) {
	t.Run("CA2: New(\"yolo\", cfg) despacha para o adapter YOLO com o mesmo contrato HTTP de hoje", func(t *testing.T) {
		var gotPath string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/analyze" {
				http.NotFound(w, r)
				return
			}
			var req analysis.AnalyzeRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				t.Fatalf("decode request: %v", err)
			}
			gotPath = req.Path
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"detections":[{"label":"person","confidence":0.9,"frame_count":1}]}`))
		}))
		defer srv.Close()

		d, err := detector.New("yolo", map[string]string{
			"service_url": srv.URL,
			"model":       "yolov8n",
		})
		if err != nil {
			t.Fatalf("New: %v", err)
		}
		dets, err := d.Detect(context.Background(), "/recordings/cam1/chunk.mp4", 0.4)
		if err != nil {
			t.Fatalf("Detect: %v", err)
		}
		if len(dets) != 1 || dets[0].Label != "person" {
			t.Fatalf("expected 1 detection labeled person, got %+v", dets)
		}
		if gotPath != "/recordings/cam1/chunk.mp4" {
			t.Fatalf("expected path forwarded to yolo service, got %q", gotPath)
		}
	})

	t.Run("CA2: New(\"\", cfg) trata string vazia como yolo (compat com detectores cadastrados antes da migration)", func(t *testing.T) {
		if _, err := detector.New("", map[string]string{"service_url": "http://yolo:8001"}); err != nil {
			t.Fatalf("expected empty type to be treated as yolo, got error: %v", err)
		}
	})

	t.Run("CA2: New(\"yolo\", cfg) sem service_url retorna erro", func(t *testing.T) {
		if _, err := detector.New("yolo", map[string]string{}); err == nil {
			t.Fatal("expected error for yolo config missing service_url")
		}
	})

	t.Run("CA2: New(\"desconhecido\", cfg) retorna erro", func(t *testing.T) {
		if _, err := detector.New("desconhecido", map[string]string{}); err == nil {
			t.Fatal("expected error for unknown detector type")
		}
	})
}
