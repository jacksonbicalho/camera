package adapters

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"camera/internal/analysis"
)

// huggingFaceInferenceAPI is the hosted Hugging Face Inference API — chosen
// over a self-hosted service (see the story analysis) so this adapter needs
// no infrastructure of its own, consistent with the rest of the project
// (runs fine on a Raspberry Pi).
const huggingFaceInferenceAPI = "https://api-inference.huggingface.co/models/"

// HuggingFace calls the hosted Inference API for a single model, sending the
// raw image bytes (the API's contract for image tasks — no multipart).
type HuggingFace struct {
	modelID string
	token   string
	client  *http.Client
	baseURL string
}

func NewHuggingFace(modelID, token string) *HuggingFace {
	return &HuggingFace{
		modelID: modelID,
		token:   token,
		client:  &http.Client{Timeout: 60 * time.Second},
		baseURL: huggingFaceInferenceAPI,
	}
}

// hfDetection is the Inference API's object-detection response shape
// (score/label/box per detected object) — normalized below into
// analysis.Detection, the same shape the yolo adapter produces.
type hfDetection struct {
	Score float64 `json:"score"`
	Label string  `json:"label"`
}

func (h *HuggingFace) Detect(ctx context.Context, path string, confidenceThreshold float64) ([]analysis.Detection, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("huggingface: read image: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.baseURL+h.modelID, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("huggingface: new request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+h.token)

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
