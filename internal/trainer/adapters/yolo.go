// Package adapters holds one Trainer implementation per fine-tuning
// backend (yolo, ...), each a thin wrapper over that backend's HTTP
// contract — mirror of internal/detector/adapters.
package adapters

import (
	"context"

	"camera/internal/analysis"
)

// Yolo delegates to the existing internal/analysis HTTP client — same
// {service_url}/finetune contract already used by the automated
// fine-tuning flow (internal/server/finetune.go).
type Yolo struct {
	client *analysis.Client
}

func NewYolo(serviceURL string) *Yolo {
	return &Yolo{client: analysis.NewClient(serviceURL)}
}

func (y *Yolo) Train(ctx context.Context, req analysis.FinetuneRequest) (string, error) {
	resp, err := y.client.Finetune(ctx, req)
	if err != nil {
		return "", err
	}
	return resp.JobID, nil
}

func (y *Yolo) Status(ctx context.Context, jobID string) (analysis.FinetuneStatus, error) {
	return y.client.FinetuneStatus(ctx, jobID)
}

func (y *Yolo) Cancel(ctx context.Context, jobID string) error {
	return y.client.CancelFinetune(ctx, jobID)
}
