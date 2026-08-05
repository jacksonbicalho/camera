// Package trainer dispatches fine-tuning jobs to a pluggable backend
// adapter (internal/trainer/adapters) chosen by a trainers.type
// discriminator — mirror of internal/detector, but with 3 methods instead
// of 1 since training is an asynchronous start→poll→cancel job, not a
// single call.
package trainer

import (
	"context"
	"fmt"

	"camera/internal/analysis"
	"camera/internal/trainer/adapters"
)

// Trainer runs a fine-tuning job against a single registered backend.
type Trainer interface {
	Train(ctx context.Context, req analysis.FinetuneRequest) (jobID string, err error)
	Status(ctx context.Context, jobID string) (analysis.FinetuneStatus, error)
	Cancel(ctx context.Context, jobID string) error
}

// New builds the adapter for trainerType ("yolo" or "" — treated as "yolo",
// same compatibility convention as internal/detector.New). Returns an error
// for an unknown type or a config missing that type's required keys.
func New(trainerType string, config map[string]string) (Trainer, error) {
	switch trainerType {
	case "yolo", "":
		serviceURL := config["service_url"]
		if serviceURL == "" {
			return nil, fmt.Errorf("yolo trainer requires service_url")
		}
		return adapters.NewYolo(serviceURL), nil
	default:
		return nil, fmt.Errorf("unknown trainer type %q", trainerType)
	}
}
