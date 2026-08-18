package server

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"camera/internal/db"
)

func (s *Server) handleGetEventByID(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid event id", http.StatusBadRequest)
		return
	}
	ev, err := db.GetMotionEventByID(s.db, id)
	if err != nil {
		http.Error(w, "event not found", http.StatusNotFound)
		return
	}
	if !s.canAccessCamera(r, ev.CameraID) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	entry := map[string]any{
		"id":    ev.ID,
		"time":  ev.OccurredAt.UTC().Format(time.RFC3339),
		"score": ev.Score,
		"bbox":  map[string]float64{"x": ev.BboxX, "y": ev.BboxY, "w": ev.BboxW, "h": ev.BboxH},
	}
	if ev.FramePath != "" {
		entry["frame"] = ev.FramePath
	}
	if ev.Label != "" {
		entry["label"] = ev.Label
	}
	if ev.Color != "" {
		entry["color"] = ev.Color
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entry)
}
