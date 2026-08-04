package server

import (
	"encoding/json"
	"net/http"

	"camera/internal/db"
)

func (s *Server) handleGetAnalysisConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	cfg, err := db.GetVideoAnalysisConfig(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
}

func (s *Server) handleUpdateAnalysisConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	var cfg db.VideoAnalysisConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := db.UpdateVideoAnalysisConfig(s.db, cfg); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg)
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
