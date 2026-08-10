package server

import (
	"encoding/json"
	"net/http"

	"camera/internal/db"
)

// extensionsConfigDTO is the body of GET/PUT /api/settings/extensions.
// TelegramAvailable is read-only (computed from whether the instance has a
// BotToken configured, internal/config.ExtensionsConfig) — never accepted
// on PUT. TelegramEnabled is the only thing the admin toggles; it has no
// effect yet (internal/extensions/telegram isn't wired to anything — see
// work_progress/analysis).
type extensionsConfigDTO struct {
	TelegramEnabled   bool `json:"telegram_enabled"`
	TelegramAvailable bool `json:"telegram_available"`
}

func (s *Server) handleGetExtensionsConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	enabled, err := db.GetTelegramExtensionEnabled(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(extensionsConfigDTO{
		TelegramEnabled:   enabled,
		TelegramAvailable: s.extensionsCfg.Telegram.BotToken != "",
	})
}

func (s *Server) handleUpdateExtensionsConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	var body extensionsConfigDTO
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := db.SetTelegramExtensionEnabled(s.db, body.TelegramEnabled); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(extensionsConfigDTO{
		TelegramEnabled:   body.TelegramEnabled,
		TelegramAvailable: s.extensionsCfg.Telegram.BotToken != "",
	})
}
