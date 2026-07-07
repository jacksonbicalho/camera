package server

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"camera/internal/db"
)

const emailChangeCodeTTL = 15 * time.Minute

// generateEmailChangeCode returns a random 6-digit numeric code — short enough to type by
// hand (unlike the 32-byte hex token used for password reset, which travels as a link).
func generateEmailChangeCode() (string, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	n := binary.BigEndian.Uint32(b[:]) % 1_000_000
	return fmt.Sprintf("%06d", n), nil
}

// handleGetMe returns the authenticated user's profile (username, email, name, role) — the
// data the Perfil page shows.
func (s *Server) handleGetMe(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusInternalServerError)
		return
	}
	u, err := db.GetUserByID(s.db, s.currentUserID(r))
	if err != nil {
		http.Error(w, "failed to load profile", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"username": u.Username,
		"email":    u.Email,
		"name":     u.Name,
		"role":     u.Role,
	})
}

// handleUpdateMe updates the user's name and/or username (login) — NOT e-mail, which has its
// own confirmation flow (handleRequestEmailChange/handleConfirmEmailChange), and NOT role,
// which is admin-only and managed at /settings/users, never here. Username changes are
// checked for uniqueness (same convention as e-mail) — pointer fields so the caller can send
// just one of the two without clobbering the other.
func (s *Server) handleUpdateMe(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		Name     *string `json:"name"`
		Username *string `json:"username"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	userID := s.currentUserID(r)
	if body.Username != nil {
		username := strings.TrimSpace(*body.Username)
		if username == "" {
			http.Error(w, "usuário não pode ficar em branco", http.StatusBadRequest)
			return
		}
		if err := db.SetUsername(s.db, userID, username); err != nil {
			http.Error(w, "usuário já está em uso", http.StatusConflict)
			return
		}
	}
	if body.Name != nil {
		if err := db.SetUserName(s.db, userID, strings.TrimSpace(*body.Name)); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleRequestEmailChange starts an e-mail change: generates a confirmation code and sends
// it to the NEW address (confirms the user actually controls it — unlike forgot-password,
// this is an authenticated action with no identity to hide, so a missing SMTP sender is a
// real 400, not a silent 200).
func (s *Server) handleRequestEmailChange(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		NewEmail string `json:"new_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !strings.Contains(body.NewEmail, "@") {
		http.Error(w, "e-mail inválido", http.StatusBadRequest)
		return
	}
	if s.emailSender == nil {
		http.Error(w, "e-mail não configurado no servidor", http.StatusBadRequest)
		return
	}

	code, err := generateEmailChangeCode()
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	expiresAt := time.Now().Add(emailChangeCodeTTL)
	if err := db.SetEmailChangeCode(s.db, s.currentUserID(r), body.NewEmail, code, expiresAt); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	msg := fmt.Sprintf("Seu código de confirmação (válido por 15 minutos): %s", code)
	if err := s.emailSender.Send(body.NewEmail, "Confirmação de e-mail", msg); err != nil {
		http.Error(w, "falha ao enviar e-mail", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// handleConfirmEmailChange validates the code and, if it matches and hasn't expired,
// persists the pending e-mail as the user's new e-mail.
func (s *Server) handleConfirmEmailChange(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Code == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	userID := s.currentUserID(r)
	newEmail, code, expiresAt, err := db.GetEmailChangeCode(s.db, userID)
	if err != nil || code == "" || code != body.Code || time.Now().After(expiresAt) {
		http.Error(w, "código inválido ou expirado", http.StatusBadRequest)
		return
	}

	if err := db.SetUserEmail(s.db, userID, newEmail); err != nil {
		http.Error(w, "e-mail já está em uso", http.StatusConflict)
		return
	}
	if err := db.ClearEmailChangeCode(s.db, userID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
