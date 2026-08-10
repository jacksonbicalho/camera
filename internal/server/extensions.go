package server

import (
	"encoding/json"
	"net/http"

	"camera/internal/db"
)

// extensionDTO is one entry of GET /api/settings/extensions. Category and
// Description are intrinsic to each extension (hardcoded below, never
// user-configurable) — Available reflects config.ExtensionsConfig (the YAML
// bootstrap file: "permitida no sistema"), Active reflects the per-instance
// system_config toggle the admin flips in Preferências > Extensões ("o
// usuário marcou como ativo"). The two are deliberately distinct concepts.
type extensionDTO struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Available   bool   `json:"available"`
	Active      bool   `json:"active"`
}

// extensionsMeta is the fixed (non-configurable) metadata for each known
// extension, plus how to compute whether it's available from the loaded
// config.ExtensionsConfig. A plain slice, not a registry/map indirection —
// only 2 concrete extensions exist today (regra dos três, CLAUDE.md).
func (s *Server) extensionsMeta() []extensionDTO {
	return []extensionDTO{
		{
			ID:          "telegram",
			Name:        "Telegram",
			Category:    "Notificações",
			Description: "Envia notificações de movimento via Telegram.",
			Available:   s.extensionsCfg.Telegram.Enabled && s.extensionsCfg.Telegram.BotToken != "",
		},
	}
}

func (s *Server) handleGetExtensionsConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	list := s.extensionsMeta()
	for i := range list {
		active, err := db.GetExtensionActive(s.db, list[i].ID)
		if err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		list[i].Active = active
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func (s *Server) handleUpdateExtensionConfig(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	id := r.PathValue("id")
	found := false
	for _, e := range s.extensionsMeta() {
		if e.ID == id {
			found = true
			break
		}
	}
	if !found {
		http.NotFound(w, r)
		return
	}
	var body struct {
		Active bool `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := db.SetExtensionActive(s.db, id, body.Active); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}
