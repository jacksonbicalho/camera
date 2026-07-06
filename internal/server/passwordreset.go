package server

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"camera/internal/db"
)

const passwordResetTokenTTL = 30 * time.Minute

func generateResetToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// handleForgotPassword always responds 200 (even for an unknown e-mail) so
// the endpoint never leaks which addresses have an account.
func (s *Server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	userID, err := findUserIDByEmail(s.db, body.Email)
	if err == nil && s.emailSender != nil {
		token, genErr := generateResetToken()
		if genErr == nil {
			expiresAt := time.Now().Add(passwordResetTokenTTL)
			if setErr := db.SetPasswordResetToken(s.db, userID, token, expiresAt); setErr == nil {
				link := fmt.Sprintf("%s/reset-password?token=%s", requestOrigin(r), token)
				msg := fmt.Sprintf("Clique no link para redefinir sua senha (válido por 30 minutos):\n%s", link)
				_ = s.emailSender.Send(body.Email, "Redefinição de senha", msg)
			}
		}
	}
	w.WriteHeader(http.StatusOK)
}

func (s *Server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Token == "" || body.Password == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	userID, err := db.FindUserByPasswordResetToken(s.db, body.Token)
	if err != nil {
		http.Error(w, "invalid or expired token", http.StatusBadRequest)
		return
	}
	_, expiresAt, err := db.GetPasswordResetToken(s.db, userID)
	if err != nil || time.Now().After(expiresAt) {
		http.Error(w, "invalid or expired token", http.StatusBadRequest)
		return
	}

	if err := db.ClearMustChangePassword(s.db, userID, body.Password); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if err := db.ClearPasswordResetToken(s.db, userID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func findUserIDByEmail(database *db.DB, email string) (int64, error) {
	u, err := db.GetUserByLogin(database, email)
	if err != nil {
		return 0, err
	}
	if u.Email != email {
		return 0, fmt.Errorf("not an email match")
	}
	return u.ID, nil
}

func requestOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s", scheme, r.Host)
}
