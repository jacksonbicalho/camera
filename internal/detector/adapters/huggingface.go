package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"camera/internal/analysis"
)

// huggingFaceInferenceAPI is the hosted Hugging Face Inference API's default
// base URL — chosen over a self-hosted service (see the story analysis) so
// this adapter needs no infrastructure of its own, consistent with the rest
// of the project (runs fine on a Raspberry Pi). Confirmed against the live
// API (2026-08-04): the legacy api-inference.huggingface.co host this
// constant used to point at is gone — Hugging Face now routes inference
// through router.huggingface.co, split by provider ("hf-inference" is their
// own first-party provider). Cadastro exposes this as an editable URL field
// (never hardcode-only a 3rd-party endpoint that can move again) — this
// constant is only the default when that field is left blank.
const huggingFaceInferenceAPI = "https://router.huggingface.co/hf-inference/models/"

// HuggingFace calls the hosted Inference API for a single model, sending the
// raw image bytes (the API's contract for image tasks — no multipart).
type HuggingFace struct {
	modelID string
	token   string
	client  *http.Client
	baseURL string
}

// NewHuggingFace builds an adapter targeting baseURL+modelID. An empty
// baseURL falls back to huggingFaceInferenceAPI (the current default hosted
// endpoint); a trailing "/" is added if missing so callers can pass either
// form.
func NewHuggingFace(modelID, token, baseURL string) *HuggingFace {
	if baseURL == "" {
		baseURL = huggingFaceInferenceAPI
	} else if !strings.HasSuffix(baseURL, "/") {
		baseURL += "/"
	}
	return &HuggingFace{
		modelID: modelID,
		token:   token,
		client:  &http.Client{Timeout: 60 * time.Second},
		baseURL: baseURL,
	}
}

// hfDetection is the Inference API's object-detection response shape
// (score/label/box per detected object) — normalized below into
// analysis.Detection, the same shape the yolo adapter produces.
type hfDetection struct {
	Score float64 `json:"score"`
	Label string  `json:"label"`
}

// contentTypeFor resolves the Content-Type the Inference API needs to accept
// the upload — without it (confirmed against the live API) a well-formed
// request still comes back 400. Falls back to image/jpeg (the format every
// still-image upload in this app actually is — motion _frame.jpg/_motion.jpg,
// the detector "test" page upload, or a frame just extracted from video
// below) when the extension is missing/unknown.
func contentTypeFor(path string) string {
	if ct := mime.TypeByExtension(filepath.Ext(path)); ct != "" {
		return ct
	}
	return "image/jpeg"
}

// imageExtensions are the file types passed straight through to the
// Inference API as-is; anything else is treated as video (see loadImage).
var imageExtensions = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".bmp": true, ".gif": true,
}

// extractVideoFrame grabs a single JPEG frame via ffmpeg — a package var so
// tests can override it and never require the ffmpeg binary. Mirrors
// cmd/camera/main.go's extractFrame (not reusable directly: that one lives
// in package main), including its fallback: "-ss 1" skips a possible
// black/transitional first frame without needing to know the clip's real
// duration, but a clip shorter than 1s makes ffmpeg exit 0 with no bytes —
// retry with "-sseof -1" (1s before EOF) when that happens, same as
// cmd/camera/main.go, instead of silently sending an empty body upstream.
var extractVideoFrame = func(ctx context.Context, path string) ([]byte, error) {
	data, err := runFFmpegFrame(ctx, "-ss", "1", path)
	if err == nil && len(data) > 0 {
		return data, nil
	}
	data, err = runFFmpegFrame(ctx, "-sseof", "-1", path)
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("ffmpeg produced no frame")
	}
	return data, nil
}

func runFFmpegFrame(ctx context.Context, seekFlag, seekValue, path string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, "ffmpeg", seekFlag, seekValue, "-i", path, "-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg", "-")
	return cmd.Output()
}

// loadImage returns bytes the Inference API can actually analyze plus their
// Content-Type. The automated per-camera analysis pipeline
// (internal/storage/cleaner.go) calls Detect with an MP4 recording path —
// the Inference API only understands still images, so a video path gets one
// frame extracted first; the ad-hoc "test" upload is always already an
// image, so this is a no-op for that path.
func loadImage(ctx context.Context, path string) ([]byte, string, error) {
	if imageExtensions[strings.ToLower(filepath.Ext(path))] {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, "", fmt.Errorf("huggingface: read image: %w", err)
		}
		return data, contentTypeFor(path), nil
	}
	frame, err := extractVideoFrame(ctx, path)
	if err != nil {
		return nil, "", fmt.Errorf("huggingface: extract frame from video: %w", err)
	}
	return frame, "image/jpeg", nil
}

func (h *HuggingFace) Detect(ctx context.Context, path string, confidenceThreshold float64) ([]analysis.Detection, error) {
	data, contentType, err := loadImage(ctx, path)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.baseURL+h.modelID, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("huggingface: new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+h.token)
	req.Header.Set("Content-Type", contentType)

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("huggingface: request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("huggingface inference api returned %d", resp.StatusCode)
	}

	var results []hfDetection
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("huggingface: decode response: %w", err)
	}

	dets := make([]analysis.Detection, 0, len(results))
	for _, r := range results {
		if r.Score < confidenceThreshold {
			continue
		}
		dets = append(dets, analysis.Detection{Label: r.Label, Confidence: r.Score, FrameCount: 1})
	}
	return dets, nil
}
