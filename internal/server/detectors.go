package server

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

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
