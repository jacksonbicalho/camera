package server

import (
	"encoding/json"
	"net/http"

	"camera/internal/db"
)

// analysisConfigDTO é o único dado global que sobra em /api/settings/analysis
// depois que detectores (por câmera) e trainers (fine-tuning) passaram a
// carregar seu próprio service_url/model: qual trainer cadastrado alimenta
// a state classification (internal/db/analysis.go,
// GetStateClassificationTrainerID/SetStateClassificationTrainerID).
type analysisConfigDTO struct {
	StateTrainerID *int64 `json:"state_trainer_id"`
}

func (s *Server) handleGetAnalysisConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id, err := db.GetStateClassificationTrainerID(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analysisConfigDTO{StateTrainerID: id})
}

func (s *Server) handleUpdateAnalysisConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	var body analysisConfigDTO
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := db.SetStateClassificationTrainerID(s.db, body.StateTrainerID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(body)
}

type cameraAnalysisConfigDTO struct {
	Enabled             bool     `json:"enabled"`
	DetectorID          *int64   `json:"detector_id"`
	ConfidenceThreshold *float64 `json:"confidence_threshold"`
}

func (s *Server) handleGetCameraAnalysisConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	cameraID := r.PathValue("id")
	cfg, err := db.GetCameraAnalysisConfig(s.db, cameraID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cameraAnalysisConfigDTO{
		Enabled:             cfg.Enabled,
		DetectorID:          cfg.DetectorID,
		ConfidenceThreshold: cfg.ConfidenceThreshold,
	})
}

func (s *Server) handleUpdateCameraAnalysisConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	cameraID := r.PathValue("id")
	var body cameraAnalysisConfigDTO
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	cfg := db.CameraAnalysisConfig{
		Enabled:             body.Enabled,
		DetectorID:          body.DetectorID,
		ConfidenceThreshold: body.ConfidenceThreshold,
	}
	if err := db.SetCameraAnalysisConfig(s.db, cameraID, cfg); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cameraAnalysisConfigDTO{
		Enabled:             cfg.Enabled,
		DetectorID:          cfg.DetectorID,
		ConfidenceThreshold: cfg.ConfidenceThreshold,
	})
}
