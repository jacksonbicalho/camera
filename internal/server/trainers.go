package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"camera/internal/db"
)

type trainerDTO struct {
	ID        int64             `json:"id"`
	Name      string            `json:"name"`
	Type      string            `json:"type"`
	CreatedAt time.Time         `json:"created_at"`
	Config    map[string]string `json:"config"`
}

func trainerToDTO(t db.Trainer) trainerDTO {
	return trainerDTO{
		ID:        t.ID,
		Name:      t.Name,
		Type:      t.Type,
		CreatedAt: t.CreatedAt,
		Config:    t.Config,
	}
}

// validateTrainerConfig mirrors trainer.New's own per-type validation (kept
// separate so the HTTP layer can reject an incomplete cadastro with a clear
// 400 before ever persisting it) — mirror of validateDetectorConfig.
func validateTrainerConfig(trainerType string, config map[string]string) error {
	switch trainerType {
	case "yolo", "":
		if config["service_url"] == "" {
			return fmt.Errorf("yolo trainer requires service_url")
		}
	default:
		return fmt.Errorf("unknown trainer type %q", trainerType)
	}
	return nil
}

func (s *Server) handleListTrainers(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	list, err := db.ListTrainers(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	out := make([]trainerDTO, len(list))
	for i, t := range list {
		out[i] = trainerToDTO(t)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

func (s *Server) handleCreateTrainer(w http.ResponseWriter, r *http.Request) {
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
	trainerType := input.Type
	if trainerType == "" {
		trainerType = "yolo"
	}
	if err := validateTrainerConfig(trainerType, input.Config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	id, err := db.InsertTrainer(s.db, input.Name, trainerType, input.Config)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	created, err := db.GetTrainer(s.db, id)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(trainerToDTO(created))
}

func (s *Server) handleUpdateTrainer(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if _, err := db.GetTrainer(s.db, id); err != nil {
		http.Error(w, "trainer not found", http.StatusNotFound)
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
	trainerType := input.Type
	if trainerType == "" {
		trainerType = "yolo"
	}
	if err := validateTrainerConfig(trainerType, input.Config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := db.UpdateTrainer(s.db, id, input.Name, trainerType, input.Config); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	updated, err := db.GetTrainer(s.db, id)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(trainerToDTO(updated))
}

func (s *Server) handleDeleteTrainer(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if _, err := db.GetTrainer(s.db, id); err != nil {
		http.Error(w, "trainer not found", http.StatusNotFound)
		return
	}
	if err := db.DeleteTrainer(s.db, id); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
