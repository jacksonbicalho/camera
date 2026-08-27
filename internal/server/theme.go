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
	_, telegramUsername, telegramFirstName, _, err := db.GetUserTelegramChatInfo(s.db, s.currentUserID(r))
	if err != nil {
		http.Error(w, "failed to load preferences", http.StatusInternalServerError)
		return
	}
	// telegram_motion_notify_enabled/push_subscribed alimentam o gate da
	// seção "Testes" em Preferências — decide se cada botão de teste vem
	// habilitado, sem o frontend precisar confiar em estado local (ex. o
	// registro do Service Worker, que já provou divergir do backend).
	telegramActive, chatID, telegramMotionNotifyEnabled, err := s.telegramGateStatus(s.currentUserID(r))
	if err != nil {
		http.Error(w, "failed to load preferences", http.StatusInternalServerError)
		return
	}
	pushSubs, err := db.ListPushSubscriptionsForUser(s.db, s.currentUserID(r))
	if err != nil {
		http.Error(w, "failed to load preferences", http.StatusInternalServerError)
		return
	}
	// telegram_bot_username is the BOT's own @handle (not the user's) — used
	// by the frontend to build an "open chat" link (https://t.me/<handle>).
	// Best-effort: only resolvable when the extension is actually configured
	// with a valid token, so a failure here degrades to "" rather than
	// failing the whole preferences response over a field only the Telegram
	// card needs.
	var telegramBotUsername string
	if s.extensionsCfg.Telegram.Enabled && s.extensionsCfg.Telegram.BotToken != "" {
		telegramBotUsername, _ = s.telegramUsername()
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"theme":                          theme,
		"accent":                         accent,
		"notify_email":                   notifyEmail,
		"telegram_linked":                chatID != "",
		"telegram_active":                telegramActive,
		"telegram_username":              telegramUsername,
		"telegram_first_name":            telegramFirstName,
		"telegram_bot_username":          telegramBotUsername,
		"telegram_motion_notify_enabled": telegramMotionNotifyEnabled,
		"push_subscribed":                len(pushSubs) > 0,
	})
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
