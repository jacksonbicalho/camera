package server

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strconv"

	"camera/internal/analysis"
	"camera/internal/db"
	"camera/internal/trainer"
)

func (s *Server) handleReanalyze(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	if err := db.ResetDetectionsForReanalysis(s.db); err != nil {
		http.Error(w, "failed to reset detections: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleListModels(w http.ResponseWriter, r *http.Request) {
	cfg, err := db.GetVideoAnalysisConfig(s.db)
	if err != nil || cfg.ServiceURL == "" {
		http.Error(w, "analysis service not configured", http.StatusServiceUnavailable)
		return
	}
	client := analysis.NewClient(cfg.ServiceURL)
	models, err := client.Models(r.Context())
	if err != nil {
		http.Error(w, "yolo service unavailable", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models)
}

// resolveTrainer looks up a registered trainer by id and builds its adapter
// — shared by start/status/cancel now that fine-tuning dispatches via the
// trainers cadastro (internal/trainer) instead of reading
// video_analysis_config.ServiceURL directly. Writes the error response
// itself (404 unknown id vs. 400 misconfigured type/config — same split as
// handleTestDetector in detectors.go) so call sites just check ok. Returns
// the db.Trainer alongside the adapter so handleStartFinetune can read
// Config["model"] — status/cancel callers ignore it.
func (s *Server) resolveTrainer(w http.ResponseWriter, trainerID int64) (trainer.Trainer, db.Trainer, bool) {
	t, err := db.GetTrainer(s.db, trainerID)
	if err != nil {
		http.Error(w, "trainer not found", http.StatusNotFound)
		return nil, db.Trainer{}, false
	}
	tr, err := trainer.New(t.Type, t.Config)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return nil, db.Trainer{}, false
	}
	return tr, t, true
}

func (s *Server) handleStartFinetune(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}

	var body struct {
		TrainerID int64 `json:"trainer_id"`
		Epochs    int   `json:"epochs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if body.TrainerID == 0 {
		http.Error(w, "trainer_id is required", http.StatusBadRequest)
		return
	}
	tr, t, ok := s.resolveTrainer(w, body.TrainerID)
	if !ok {
		return
	}

	epochs := 20
	if body.Epochs > 0 && body.Epochs <= 200 {
		epochs = body.Epochs
	}

	annotations, err := db.ListAllAnnotations(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	labeledEvents, err := db.ListLabeledEvents(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if len(annotations) == 0 && len(labeledEvents) == 0 {
		http.Error(w, "no annotations available", http.StatusBadRequest)
		return
	}

	items := make([]analysis.AnnotationItem, 0, len(annotations)+len(labeledEvents))
	for _, a := range annotations {
		ev, err := db.GetMotionEventByID(s.db, a.EventID)
		if err != nil || ev.FramePath == "" {
			continue
		}
		datePart := ev.OccurredAt.UTC().Format("2006/01/02")
		imagePath := filepath.Join(s.cfg.RecordingsPath, ev.CameraID, datePart, ev.FramePath)
		items = append(items, analysis.AnnotationItem{
			ImagePath: imagePath,
			Label:     a.Label,
			BboxX:     a.BboxX,
			BboxY:     a.BboxY,
			BboxW:     a.BboxW,
			BboxH:     a.BboxH,
		})
	}
	// Text-labeled events without manual bounding boxes use a full-image bbox.
	for _, ev := range labeledEvents {
		datePart := ev.OccurredAt.UTC().Format("2006/01/02")
		imagePath := filepath.Join(s.cfg.RecordingsPath, ev.CameraID, datePart, ev.FramePath)
		items = append(items, analysis.AnnotationItem{
			ImagePath: imagePath,
			Label:     ev.Label,
			BboxX:     0.5,
			BboxY:     0.5,
			BboxW:     1.0,
			BboxH:     1.0,
		})
	}
	if len(items) == 0 {
		http.Error(w, "no annotations with associated snapshots", http.StatusBadRequest)
		return
	}

	baseModel := t.Config["model"]
	if baseModel == "" {
		baseModel = "yolov8n"
	}
	jobID, err := tr.Train(context.Background(), analysis.FinetuneRequest{
		Annotations: items,
		BaseModel:   baseModel,
		Epochs:      epochs,
	})
	if err != nil {
		http.Error(w, "finetune request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analysis.FinetuneResponse{JobID: jobID})
}

func (s *Server) handleCancelFinetune(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	trainerID, err := strconv.ParseInt(r.URL.Query().Get("trainer_id"), 10, 64)
	if err != nil {
		http.Error(w, "trainer_id is required", http.StatusBadRequest)
		return
	}
	tr, _, ok := s.resolveTrainer(w, trainerID)
	if !ok {
		return
	}
	jobID := r.PathValue("job_id")
	_ = tr.Cancel(r.Context(), jobID)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFinetuneStatus(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	trainerID, err := strconv.ParseInt(r.URL.Query().Get("trainer_id"), 10, 64)
	if err != nil {
		http.Error(w, "trainer_id is required", http.StatusBadRequest)
		return
	}
	tr, _, ok := s.resolveTrainer(w, trainerID)
	if !ok {
		return
	}

	jobID := r.PathValue("job_id")
	status, err := tr.Status(context.Background(), jobID)
	if err != nil {
		if err.Error() == "job not found" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(analysis.FinetuneStatus{
				Status: "error",
				Error:  "Job perdido: o serviço YOLO reiniciou durante o treino. Modelo muito grande para a memória disponível — tente um modelo menor (ex: yolov8n).",
			})
			return
		}
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if status.Status == "done" || status.Status == "completed" {
		_ = db.SetHasCustomModel(s.db, true)
		if err := db.ResetDetectionsForReanalysis(s.db); err != nil {
			s.log.Warn("finetune done: reset detections failed", "err", err)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}
