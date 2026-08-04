package adapters

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// TestDetectorAdapterPattern covers the story feat(analysis): object detector
// adapter pattern (yolo/hugging face). Passes a local httptest server as the
// baseURL constructor arg so the test never hits the real Hugging Face
// Inference API.
func TestDetectorAdapterPattern(t *testing.T) {
	t.Run("CA8: NewHuggingFace com baseURL vazio usa a Inference API hospedada real (router.huggingface.co)", func(t *testing.T) {
		// Trava o default em código, não só em prosa da story — evita uma
		// regressão silenciosa se alguém "simplificar" o parâmetro de volta
		// pro host antigo (api-inference.huggingface.co), que parou de
		// responder no host raiz (a Hugging Face migrou pra roteamento por
		// provider em router.huggingface.co — descoberto testando com curl
		// contra a API real, não documentação).
		h := NewHuggingFace("facebook/detr-resnet-50", "hf_testtoken", "")
		if h.baseURL != "https://router.huggingface.co/hf-inference/models/" {
			t.Fatalf("expected default baseURL to be the current hosted Inference API, got %q", h.baseURL)
		}
	})

	t.Run("CA3: Detect chama a Inference API com o token, normaliza a resposta e aplica o limiar de confiança", func(t *testing.T) {
		var gotAuth, gotPath, gotContentType string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotAuth = r.Header.Get("Authorization")
			gotPath = r.URL.Path
			gotContentType = r.Header.Get("Content-Type")
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

		h := NewHuggingFace("facebook/detr-resnet-50", "hf_testtoken", srv.URL+"/models/")

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
		if gotContentType != "image/jpeg" {
			// Confirmado contra a API real: sem Content-Type, um upload
			// válido ainda volta 400 — mesmo quando o header não bate com o
			// formato real do arquivo (a API não valida a assinatura dos
			// bytes), então basta enviar ALGUM Content-Type de imagem.
			t.Fatalf("expected Content-Type image/jpeg (from .jpg extension), got %q", gotContentType)
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

		h := NewHuggingFace("facebook/detr-resnet-50", "hf_testtoken", srv.URL+"/models/")

		if _, err := h.Detect(context.Background(), img, 0.4); err == nil {
			t.Fatal("expected error when the Inference API returns a non-200 status")
		}
	})

	t.Run("CA10: Detect extrai um frame via ffmpeg quando o path não é uma imagem (ex.: gravação .mp4)", func(t *testing.T) {
		orig := extractVideoFrame
		defer func() { extractVideoFrame = orig }()

		var gotFramePath string
		extractVideoFrame = func(_ context.Context, path string) ([]byte, error) {
			gotFramePath = path
			return []byte("fake-jpeg-frame-bytes"), nil
		}

		var gotContentType string
		var gotBody []byte
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotContentType = r.Header.Get("Content-Type")
			gotBody, _ = io.ReadAll(r.Body)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		}))
		defer srv.Close()

		video := filepath.Join(t.TempDir(), "recording.mp4")
		if err := os.WriteFile(video, []byte("fake-mp4-bytes"), 0o644); err != nil {
			t.Fatalf("write test video: %v", err)
		}

		h := NewHuggingFace("facebook/detr-resnet-50", "hf_testtoken", srv.URL+"/models/")
		if _, err := h.Detect(context.Background(), video, 0.4); err != nil {
			t.Fatalf("Detect: %v", err)
		}
		if gotFramePath != video {
			t.Fatalf("expected extractVideoFrame called with the recording path, got %q", gotFramePath)
		}
		if gotContentType != "image/jpeg" {
			t.Fatalf("expected image/jpeg content type for the extracted frame, got %q", gotContentType)
		}
		if string(gotBody) != "fake-jpeg-frame-bytes" {
			t.Fatalf("expected the extracted frame bytes to be sent as the request body, got %q", gotBody)
		}
	})
}
