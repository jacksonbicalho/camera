package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"camera/internal/db"
	"camera/internal/detector"
)

type objectDetectorDTO struct {
	ID        int64             `json:"id"`
	Name      string            `json:"name"`
	Type      string            `json:"type"`
	CreatedAt time.Time         `json:"created_at"`
	Config    map[string]string `json:"config"`
}

// detectorToDTO strips api_token — a secret — from the config it echoes
// back; callers only ever set a new one, never read the stored value.
func detectorToDTO(d db.ObjectDetector) objectDetectorDTO {
	cfg := make(map[string]string, len(d.Config))
	for k, v := range d.Config {
		if k == "api_token" {
			continue
		}
		cfg[k] = v
	}
	return objectDetectorDTO{
		ID:        d.ID,
		Name:      d.Name,
		Type:      d.Type,
		CreatedAt: d.CreatedAt,
		Config:    cfg,
	}
}

// validateDetectorConfig mirrors detector.New's own per-type validation
// (kept separate so the HTTP layer can reject an incomplete cadastro with a
// clear 400 before ever persisting it, rather than only failing later at
// test/analyze time).
func validateDetectorConfig(detectorType string, config map[string]string) error {
	switch detectorType {
	case "yolo", "":
		if config["service_url"] == "" {
			return fmt.Errorf("yolo detector requires service_url")
		}
	case "huggingface":
		if config["model_id"] == "" || config["api_token"] == "" {
			return fmt.Errorf("huggingface detector requires model_id and api_token")
		}
	default:
		return fmt.Errorf("unknown detector type %q", detectorType)
	}
	return nil
}

func (s *Server) handleListDetectors(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	list, err := db.ListObjectDetectors(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	out := make([]objectDetectorDTO, len(list))
	for i, d := range list {
		out[i] = detectorToDTO(d)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *Server) handleCreateDetector(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	var input struct {
		Name   string            `json:"name"`
		Type   string            `json:"type"`
		Config map[string]string `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	detectorType := input.Type
	if detectorType == "" {
		detectorType = "yolo"
	}
	if err := validateDetectorConfig(detectorType, input.Config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	id, err := db.InsertObjectDetector(s.db, input.Name, input.Config)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if err := db.SetObjectDetectorType(s.db, id, detectorType); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	created, err := db.GetObjectDetector(s.db, id)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(detectorToDTO(created))
}

func (s *Server) handleUpdateDetector(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	existing, err := db.GetObjectDetector(s.db, id)
	if err != nil {
		http.Error(w, "detector not found", http.StatusNotFound)
		return
	}
	var input struct {
		Name   string            `json:"name"`
		Type   string            `json:"type"`
		Config map[string]string `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if input.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	detectorType := input.Type
	if detectorType == "" {
		detectorType = "yolo"
	}
	// api_token is never echoed back (detectorToDTO strips it), so an empty
	// value here means "unchanged", not "clear it" — same convention as the
	// password field in UserForm.
	if detectorType == "huggingface" && input.Config["api_token"] == "" {
		if input.Config == nil {
			input.Config = map[string]string{}
		}
		input.Config["api_token"] = existing.Config["api_token"]
	}
	if err := validateDetectorConfig(detectorType, input.Config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := db.UpdateObjectDetector(s.db, id, input.Name, input.Config); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if err := db.SetObjectDetectorType(s.db, id, detectorType); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	updated, err := db.GetObjectDetector(s.db, id)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detectorToDTO(updated))
}

func (s *Server) handleDeleteDetector(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if _, err := db.GetObjectDetector(s.db, id); err != nil {
		http.Error(w, "detector not found", http.StatusNotFound)
		return
	}
	if err := db.DeleteObjectDetector(s.db, id); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleTestDetector runs one ad-hoc inference against an uploaded image/video
// using a registered detector's config. The file never touches the recordings
// tree: it's written to a scratch dir under storage (same shared volume the
// YOLO container reads from — see internal/storage's use of Storage.Path),
// analyzed, then removed regardless of outcome.
func (s *Server) handleTestDetector(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	det, err := db.GetObjectDetector(s.db, id)
	if err != nil {
		http.Error(w, "detector not found", http.StatusNotFound)
		return
	}
	dt, err := detector.New(det.Type, det.Config)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "invalid multipart form", http.StatusBadRequest)
		return
	}
	// Uploads over the in-memory threshold make mime/multipart spill the file
	// part to its own temp file under os.TempDir() (net/http docs: caller must
	// RemoveAll it) — separate from tmpPath below, which is only our own copy.
	defer func() {
		if r.MultipartForm != nil {
			r.MultipartForm.RemoveAll()
		}
	}()
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	tmpDir := s.storageCfg.Path
	if tmpDir == "" {
		tmpDir = os.TempDir()
	}
	tmpDir = filepath.Join(tmpDir, "tmp", "detector-test")
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	tmpFile, err := os.CreateTemp(tmpDir, "upload-*"+filepath.Ext(header.Filename))
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	if _, err := io.Copy(tmpFile, file); err != nil {
		tmpFile.Close()
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if err := tmpFile.Close(); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	confidence := 0.4
	if v, err := strconv.ParseFloat(det.Config["confidence_threshold"], 64); err == nil {
		confidence = v
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()
	dets, err := dt.Detect(ctx, tmpPath, confidence)
	if err != nil {
		http.Error(w, "analyze failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"detections": dets})
}
