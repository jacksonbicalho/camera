package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"camera/internal/db"
	"camera/internal/extensions/telegram"
	"camera/internal/notifications"
)

// telegramLinkCodeTTL mirrors passwordResetTokenTTL's spirit (short-lived,
// single-use token) but shorter — a linking code is consumed within
// seconds of the user clicking the deep-link, not "click a link from an
// e-mail later".
const telegramLinkCodeTTL = 10 * time.Minute

func generateTelegramLinkCode() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// telegramUsername resolves the bot's @username, caching it after the
// first successful call — it's fully derived from bot_token (via GetMe)
// and never changes for a given token, so there's no reason to hit the
// Telegram API on every "Vincular" click.
func (s *Server) telegramUsername() (string, error) {
	s.telegramBotUsernameMu.Lock()
	defer s.telegramBotUsernameMu.Unlock()
	if s.telegramBotUsername != "" {
		return s.telegramBotUsername, nil
	}
	client := telegram.NewClient(s.extensionsCfg.Telegram.BotToken)
	username, err := client.GetMe()
	if err != nil {
		return "", err
	}
	s.telegramBotUsername = username
	return username, nil
}

// handleTelegramLink generates a fresh linking code for the authenticated
// user and returns the Telegram deep-link URL (t.me/<bot>?start=<code>) —
// clicking it makes the Telegram app send "/start <code>" to the bot,
// which the poller (T3) resolves back to this user.
func (s *Server) handleTelegramLink(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	if !s.extensionsCfg.Telegram.Enabled || s.extensionsCfg.Telegram.BotToken == "" {
		http.Error(w, "telegram extension not configured", http.StatusServiceUnavailable)
		return
	}
	active, err := db.GetExtensionActive(s.db, "telegram")
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if !active {
		http.Error(w, "telegram extension not active", http.StatusServiceUnavailable)
		return
	}
	code, err := generateTelegramLinkCode()
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	userID := s.currentUserID(r)
	if err := db.SetTelegramLinkCode(s.db, userID, code, time.Now().Add(telegramLinkCodeTTL)); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	username, err := s.telegramUsername()
	if err != nil {
		http.Error(w, "failed to resolve bot username", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"url": "https://t.me/" + username + "?start=" + code,
	})
}

// handleTelegramUnlink clears the authenticated user's linked Telegram
// chat_id (keeps the account, just stops being a notification target).
func (s *Server) handleTelegramUnlink(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	if err := db.ClearUserTelegramChatID(s.db, s.currentUserID(r)); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// telegramGateStatus resolves the 3 pieces of state that decide whether
// userID can receive a Telegram motion notification at all — shared by
// handleGetPreferences (GET /api/me/preferences, informs the frontend
// whether to show the "Testes" button as available) and handleTelegramTest
// (rechecks the same gate server-side before actually sending).
func (s *Server) telegramGateStatus(userID int64) (active bool, chatID string, hasCamera bool, err error) {
	active, err = db.GetExtensionActive(s.db, "telegram")
	if err != nil {
		return false, "", false, err
	}
	chatID, _, _, _, err = db.GetUserTelegramChatInfo(s.db, userID)
	if err != nil {
		return false, "", false, err
	}
	hasCamera, err = db.UserHasAnyCameraMotionTelegramNotifyEnabled(s.db, userID)
	if err != nil {
		return false, "", false, err
	}
	return active, chatID, hasCamera, nil
}

// handleTelegramTest sends a test notification to the authenticated user's
// linked Telegram chat — the "Testes" section in Preferences. Rechecks the
// full gate server-side (extension active + account linked + at least one
// camera with motion-notify enabled) instead of trusting the frontend
// already filtered: telegramSender.Send silently no-ops when the first two
// aren't met, which would otherwise look like a successful test that
// delivered nothing.
func (s *Server) handleTelegramTest(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	userID := s.currentUserID(r)

	active, chatID, hasCamera, err := s.telegramGateStatus(userID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if !active || chatID == "" || !hasCamera {
		http.Error(w, "telegram não está totalmente configurado — vincule a conta, ative a extensão e habilite a notificação de movimento em pelo menos uma câmera", http.StatusConflict)
		return
	}
	if s.telegramSender == nil {
		http.Error(w, "telegram indisponível nesta instância", http.StatusConflict)
		return
	}

	n := notifications.Notification{
		Title:   "Teste de notificação",
		Message: "Esta é uma notificação de teste do os-camera.",
	}
	if err := s.telegramSender.Send(n, userID); err != nil {
		http.Error(w, "falha ao enviar: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}
