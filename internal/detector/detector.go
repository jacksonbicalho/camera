// Package detector dispatches object-detection inference to a pluggable
// backend adapter (internal/detector/adapters) chosen by an
// object_detectors.type discriminator ("yolo"/"huggingface"). It exists so
// the cadastro/teste/análise-por-câmera flow (internal/server/detectors.go,
// internal/storage/cleaner.go) doesn't need to know which backend a given
// registered detector actually talks to.
package detector

import (
	"context"
	"fmt"

	"camera/internal/analysis"
	"camera/internal/detector/adapters"
)

// Detector runs inference over a single file, filtering results below
// confidenceThreshold — the threshold is supplied by the caller (per-camera
// or ad-hoc test value), never stored on the detector itself.
type Detector interface {
	Detect(ctx context.Context, path string, confidenceThreshold float64) ([]analysis.Detection, error)
}

// New builds the adapter for detectorType ("yolo", "huggingface", or "" —
// treated as "yolo" for compatibility with detectors registered before the
// type column existed). Returns an error for an unknown type or a config
// missing that type's required keys.
func New(detectorType string, config map[string]string) (Detector, error) {
	switch detectorType {
	case "yolo", "":
		serviceURL := config["service_url"]
		if serviceURL == "" {
			return nil, fmt.Errorf("yolo detector requires service_url")
		}
		return adapters.NewYolo(serviceURL, config["model"]), nil
	case "huggingface":
		modelID := config["model_id"]
		token := config["api_token"]
		if modelID == "" || token == "" {
			return nil, fmt.Errorf("huggingface detector requires model_id and api_token")
		}
		return adapters.NewHuggingFace(modelID, token, config["service_url"]), nil
	default:
		return nil, fmt.Errorf("unknown detector type %q", detectorType)
	}
}
