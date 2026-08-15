package server

import (
	"encoding/json"
	"net/http"

	"camera/internal/db"
)

// handleGetCameraTelegramNotify returns the requesting user's Telegram
// motion-notify opt-in for the given camera. Access control (viewer must
// have been granted the camera) is enforced upstream by authCamera.
func (s *Server) handleGetCameraTelegramNotify(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.cameraExists(id) {
		http.NotFound(w, r)
		return
	}
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusInternalServerError)
		return
	}
	enabled, minScore, err := db.GetUserCameraMotionTelegramNotify(s.db, s.currentUserID(r), id)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"enabled":   enabled,
		"min_score": minScore,
	})
}

// handleSetCameraTelegramNotify persists the requesting user's Telegram
// motion-notify opt-in for the given camera.
func (s *Server) handleSetCameraTelegramNotify(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.cameraExists(id) {
		http.NotFound(w, r)
		return
	}
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusInternalServerError)
		return
	}
	var body struct {
		Enabled  bool    `json:"enabled"`
		MinScore float64 `json:"min_score"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if body.MinScore < 0 || body.MinScore > 1 {
		http.Error(w, "min_score deve estar entre 0 e 1", http.StatusBadRequest)
		return
	}
	if err := db.SetUserCameraMotionTelegramNotify(s.db, s.currentUserID(r), id, body.Enabled, body.MinScore); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
