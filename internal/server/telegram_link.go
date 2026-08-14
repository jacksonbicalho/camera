package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"camera/internal/db"
	"camera/internal/extensions/telegram"
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
