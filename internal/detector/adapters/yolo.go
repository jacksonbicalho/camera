// Package adapters holds one Detect implementation per object-detector
// backend (yolo, huggingface, ...), each a thin wrapper over that backend's
// HTTP contract.
package adapters

import (
	"context"

	"camera/internal/analysis"
)

// Yolo delegates to the existing internal/analysis HTTP client — same
// {service_url}/analyze contract already used by the automated recording
// analysis pipeline and the detector "test" endpoint.
type Yolo struct {
	client *analysis.Client
	model  string
}

func NewYolo(serviceURL, model string) *Yolo {
	return &Yolo{client: analysis.NewClient(serviceURL), model: model}
}

func (y *Yolo) Detect(ctx context.Context, path string, confidenceThreshold float64) ([]analysis.Detection, error) {
	return y.client.Analyze(ctx, analysis.AnalyzeRequest{
		Path:                path,
		Model:               y.model,
		ConfidenceThreshold: confidenceThreshold,
	})
}
