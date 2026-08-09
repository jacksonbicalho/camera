package server

import (
	"encoding/json"
	"net/http"

	"camera/internal/db"
)

// validThemes are the UI theme preferences the frontend accepts. "system" follows
// the OS prefers-color-scheme; the frontend resolves it to dark/light at render.
var validThemes = map[string]bool{"dark": true, "light": true, "system": true}

// validAccents are the UI accent color preferences the frontend accepts.
// "default" means no override (falls back to the base --color-primary).
var validAccents = map[string]bool{"default": true, "violet": true, "teal": true, "coral": true, "amber": true}

func (s *Server) handleGetPreferences(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusInternalServerError)
		return
	}
	theme, err := db.GetUserTheme(s.db, s.currentUserID(r))
	if err != nil {
		http.Error(w, "failed to load preferences", http.StatusInternalServerError)
		return
	}
	accent, err := db.GetUserAccentColor(s.db, s.currentUserID(r))
	if err != nil {
		http.Error(w, "failed to load preferences", http.StatusInternalServerError)
		return
	}
	notifyEmail, err := db.GetUserNotifyEmail(s.db, s.currentUserID(r))
	if err != nil {
		http.Error(w, "failed to load preferences", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"theme": theme, "accent": accent, "notify_email": notifyEmail})
}

func (s *Server) handleUpdatePreferences(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusInternalServerError)
		return
	}
	var body struct {
		Theme       string `json:"theme"`
		Accent      string `json:"accent"`
		NotifyEmail *bool  `json:"notify_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if body.Theme != "" {
		if !validThemes[body.Theme] {
			http.Error(w, "invalid theme", http.StatusBadRequest)
			return
		}
	}
	if body.Accent != "" {
		if !validAccents[body.Accent] {
			http.Error(w, "invalid accent", http.StatusBadRequest)
			return
		}
	}
	if body.Theme != "" {
		if err := db.SetUserTheme(s.db, s.currentUserID(r), body.Theme); err != nil {
			http.Error(w, "failed to save preferences", http.StatusInternalServerError)
			return
		}
	}
	if body.Accent != "" {
		if err := db.SetUserAccentColor(s.db, s.currentUserID(r), body.Accent); err != nil {
			http.Error(w, "failed to save preferences", http.StatusInternalServerError)
			return
		}
	}
	if body.NotifyEmail != nil {
		if err := db.SetUserNotifyEmail(s.db, s.currentUserID(r), *body.NotifyEmail); err != nil {
			http.Error(w, "failed to save preferences", http.StatusInternalServerError)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
