package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

type fakeSender struct {
	to, subject, body string
	sent              bool
	err               error
}

func (f *fakeSender) Send(to, subject, body string) error {
	f.to, f.subject, f.body = to, subject, body
	f.sent = true
	return f.err
}

func passwordResetServer(t *testing.T) (*server.Server, *fakeSender, int64) {
	t.Helper()
	database := openServerTestDB(t)
	id, err := db.CreateUser(database, "sam", "oldpassword", "viewer", false)
	if err != nil {
		t.Fatalf("criar usuário: %v", err)
	}
	if err := db.SetUserEmail(database, id, "sam@example.com"); err != nil {
		t.Fatalf("SetUserEmail: %v", err)
	}
	fake := &fakeSender{}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
		WithDB(database).
		WithEmailSender(fake)
	return srv, fake, id
}

func TestForgotPassword_SendsEmail(t *testing.T) {
	srv, fake, _ := passwordResetServer(t)

	body := `{"email":"sam@example.com"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/forgot-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if !fake.sent {
		t.Fatal("expected an e-mail to be sent")
	}
	if fake.to != "sam@example.com" {
		t.Errorf("expected e-mail to sam@example.com, got %q", fake.to)
	}
	if !strings.Contains(fake.body, "/reset-password?token=") {
		t.Errorf("expected reset link in body, got: %s", fake.body)
	}
}

// --- requestOrigin atrás de reverse proxy (história feat/meta-tags-compartilhamento) ---

func TestForgotPassword_LinkUsesHTTPSBehindReverseProxy(t *testing.T) {
	t.Run("CA4: X-Forwarded-Proto: https gera link https:// mesmo com r.TLS nil (conexão HTTP até o proxy)", func(t *testing.T) {
		srv, fake, _ := passwordResetServer(t)

		body := `{"email":"sam@example.com"}`
		req := httptest.NewRequest(http.MethodPost, "/api/auth/forgot-password", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-Proto", "https")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		if !strings.Contains(fake.body, "https://") {
			t.Errorf("expected https:// link atrás de proxy, got: %s", fake.body)
		}
	})
}

func TestForgotPassword_UnknownEmailStill200(t *testing.T) {
	srv, fake, _ := passwordResetServer(t)

	body := `{"email":"ghost@example.com"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/forgot-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 even for unknown e-mail, got %d", w.Code)
	}
	if fake.sent {
		t.Error("expected no e-mail sent for unknown address")
	}
}

func TestResetPassword_ValidToken(t *testing.T) {
	srv, fake, id := passwordResetServer(t)
	_ = id

	fbody := `{"email":"sam@example.com"}`
	freq := httptest.NewRequest(http.MethodPost, "/api/auth/forgot-password", strings.NewReader(fbody))
	freq.Header.Set("Content-Type", "application/json")
	fw := httptest.NewRecorder()
	srv.ServeHTTP(fw, freq)

	idx := strings.Index(fake.body, "token=")
	if idx < 0 {
		t.Fatalf("expected token in email body: %s", fake.body)
	}
	token := fake.body[idx+len("token="):]
	token = strings.TrimSpace(strings.SplitN(token, "\n", 2)[0])
	token = strings.TrimSuffix(token, "\r")

	rbody := `{"token":"` + token + `","password":"newpassword123"}`
	rreq := httptest.NewRequest(http.MethodPost, "/api/auth/reset-password", strings.NewReader(rbody))
	rreq.Header.Set("Content-Type", "application/json")
	rw := httptest.NewRecorder()
	srv.ServeHTTP(rw, rreq)

	if rw.Code != http.StatusOK && rw.Code != http.StatusNoContent {
		t.Fatalf("expected 200/204, got %d: %s", rw.Code, rw.Body.String())
	}

	// Login with the new password should now work.
	lbody := `{"username":"sam","password":"newpassword123"}`
	lreq := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(lbody))
	lreq.Header.Set("Content-Type", "application/json")
	lw := httptest.NewRecorder()
	srv.ServeHTTP(lw, lreq)
	if lw.Code != http.StatusOK {
		t.Fatalf("expected login with new password to succeed, got %d", lw.Code)
	}
	var resp map[string]string
	json.NewDecoder(lw.Body).Decode(&resp)
	if resp["token"] == "" {
		t.Error("expected a token after login with new password")
	}
}

func TestResetPassword_ExpiredTokenRejected(t *testing.T) {
	database := openServerTestDB(t)
	id, err := db.CreateUser(database, "tara", "oldpassword", "viewer", false)
	if err != nil {
		t.Fatalf("criar usuário: %v", err)
	}
	if err := db.SetPasswordResetToken(database, id, "expired-token", time.Now().Add(-time.Hour)); err != nil {
		t.Fatalf("SetPasswordResetToken: %v", err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)

	body := `{"token":"expired-token","password":"newpassword123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/reset-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest && w.Code != http.StatusNotFound {
		t.Fatalf("expected 400/404 for expired token, got %d", w.Code)
	}
}

func TestResetPassword_InvalidTokenRejected(t *testing.T) {
	srv, _, _ := passwordResetServer(t)

	body := `{"token":"not-a-real-token","password":"newpassword123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/reset-password", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest && w.Code != http.StatusNotFound {
		t.Fatalf("expected 400/404 for invalid token, got %d", w.Code)
	}
}
