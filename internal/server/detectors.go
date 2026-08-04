package server

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"camera/internal/analysis"
	"camera/internal/db"
)

type objectDetectorDTO struct {
	ID        int64             `json:"id"`
	Name      string            `json:"name"`
	CreatedAt time.Time         `json:"created_at"`
	Config    map[string]string `json:"config"`
}

func detectorToDTO(d db.ObjectDetector) objectDetectorDTO {
	return objectDetectorDTO{
		ID:        d.ID,
		Name:      d.Name,
		CreatedAt: d.CreatedAt,
		Config:    d.Config,
	}
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
	id, err := db.InsertObjectDetector(s.db, input.Name, input.Config)
	if err != nil {
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
	if _, err := db.GetObjectDetector(s.db, id); err != nil {
		http.Error(w, "detector not found", http.StatusNotFound)
		return
	}
	var input struct {
		Name   string            `json:"name"`
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
	if err := db.UpdateObjectDetector(s.db, id, input.Name, input.Config); err != nil {
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
	serviceURL := det.Config["service_url"]
	if serviceURL == "" {
		http.Error(w, "detector has no service_url configured", http.StatusBadRequest)
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
	if v := r.FormValue("confidence_threshold"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			confidence = f
		}
	} else if v, err := strconv.ParseFloat(det.Config["confidence_threshold"], 64); err == nil {
		confidence = v
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
	defer cancel()
	dets, err := analysis.NewClient(serviceURL).Analyze(ctx, analysis.AnalyzeRequest{
		Path:                tmpPath,
		Model:               det.Config["model"],
		ConfidenceThreshold: confidence,
	})
	if err != nil {
		http.Error(w, "analyze failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"detections": dets})
}
