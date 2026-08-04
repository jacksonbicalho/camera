package adapters

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// TestDetectorAdapterPattern covers the story feat(analysis): object detector
// adapter pattern (yolo/hugging face). White-box (package adapters, not
// adapters_test): overrides the unexported baseURL field so the test never
// hits the real Hugging Face Inference API — same pattern already used by
// internal/release.NotesFetcher (f.baseURL = srv.URL + "/" in
// internal/release/notes_test.go).
func TestDetectorAdapterPattern(t *testing.T) {
	t.Run("CA3: Detect chama a Inference API com o token, normaliza a resposta e aplica o limiar de confiança", func(t *testing.T) {
		var gotAuth, gotPath string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotAuth = r.Header.Get("Authorization")
			gotPath = r.URL.Path
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[
				{"score":0.92,"label":"person","box":{"xmin":1,"ymin":2,"xmax":3,"ymax":4}},
				{"score":0.10,"label":"cat","box":{"xmin":1,"ymin":2,"xmax":3,"ymax":4}}
			]`))
		}))
		defer srv.Close()

		img := filepath.Join(t.TempDir(), "frame.jpg")
		if err := os.WriteFile(img, []byte("fake-jpeg-bytes"), 0o644); err != nil {
			t.Fatalf("write test image: %v", err)
		}

		h := NewHuggingFace("facebook/detr-resnet-50", "hf_testtoken")
		h.baseURL = srv.URL + "/models/"

		dets, err := h.Detect(context.Background(), img, 0.4)
		if err != nil {
			t.Fatalf("Detect: %v", err)
		}
		if gotAuth != "Bearer hf_testtoken" {
			t.Fatalf("expected Authorization header with token, got %q", gotAuth)
		}
		if gotPath != "/models/facebook/detr-resnet-50" {
			t.Fatalf("expected request to /models/{model_id}, got %q", gotPath)
		}
		if len(dets) != 1 || dets[0].Label != "person" || dets[0].Confidence != 0.92 {
			t.Fatalf("expected only the detection above the 0.4 threshold, got %+v", dets)
		}
	})

	t.Run("CA3: Detect devolve erro claro quando a Inference API responde erro", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "model is loading", http.StatusServiceUnavailable)
		}))
		defer srv.Close()

		img := filepath.Join(t.TempDir(), "frame.jpg")
		if err := os.WriteFile(img, []byte("fake-jpeg-bytes"), 0o644); err != nil {
			t.Fatalf("write test image: %v", err)
		}

		h := NewHuggingFace("facebook/detr-resnet-50", "hf_testtoken")
		h.baseURL = srv.URL + "/models/"

		if _, err := h.Detect(context.Background(), img, 0.4); err == nil {
			t.Fatal("expected error when the Inference API returns a non-200 status")
		}
	})
}
