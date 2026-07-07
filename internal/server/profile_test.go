package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

func profileServer(t *testing.T) (*server.Server, *fakeSender, string, int64) {
	t.Helper()
	database := openServerTestDB(t)
	id, err := db.CreateUser(database, "uma", "password123", "viewer", false)
	if err != nil {
		t.Fatalf("criar usuário: %v", err)
	}
	if err := db.SetUserEmail(database, id, "uma@example.com"); err != nil {
		t.Fatalf("SetUserEmail: %v", err)
	}
	fake := &fakeSender{}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
		WithDB(database).
		WithEmailSender(fake)
	token := loginAndGetToken(t, srv, "uma", "password123")
	return srv, fake, token, id
}

func TestGetMe_ReturnsProfile(t *testing.T) {
	srv, _, token, _ := profileServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Role     string `json:"role"`
	}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Username != "uma" || resp.Email != "uma@example.com" || resp.Role != "viewer" {
		t.Errorf("unexpected profile: %+v", resp)
	}
}

func TestGetMe_RequiresAuth(t *testing.T) {
	srv, _, _, _ := profileServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without token, got %d", w.Code)
	}
}

func TestUpdateMe_SetsNameAndUsername(t *testing.T) {
	srv, _, token, _ := profileServer(t)

	body := `{"name":"Uma Silva","username":"uma2"}`
	req := httptest.NewRequest(http.MethodPut, "/api/me", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK && w.Code != http.StatusNoContent {
		t.Fatalf("expected 200/204, got %d: %s", w.Code, w.Body.String())
	}

	// A sessão atual continua válida (JWT carrega o id, não o username) — dá pra ler o
	// perfil de novo com o MESMO token, mesmo após renomear o login.
	greq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	greq.Header.Set("Authorization", "Bearer "+token)
	gw := httptest.NewRecorder()
	srv.ServeHTTP(gw, greq)
	var resp struct {
		Name     string `json:"name"`
		Username string `json:"username"`
	}
	json.NewDecoder(gw.Body).Decode(&resp)
	if resp.Name != "Uma Silva" || resp.Username != "uma2" {
		t.Errorf("expected name/username updated, got %+v", resp)
	}
}

func TestUpdateMe_RejectsDuplicateUsername(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "walt", "password123", "viewer", false); err != nil {
		t.Fatalf("criar walt: %v", err)
	}
	if _, err := db.CreateUser(database, "xena", "password123", "viewer", false); err != nil {
		t.Fatalf("criar xena: %v", err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "walt", "password123")

	body := `{"username":"xena"}`
	req := httptest.NewRequest(http.MethodPut, "/api/me", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusConflict {
		t.Errorf("expected 409 renaming to a username already taken by another user, got %d", w.Code)
	}
}

func TestUpdateMe_RejectsBlankUsername(t *testing.T) {
	srv, _, token, _ := profileServer(t)

	body := `{"username":"   "}`
	req := httptest.NewRequest(http.MethodPut, "/api/me", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for blank username, got %d", w.Code)
	}
}

func TestRequestEmailChange_SendsCodeToNewAddress(t *testing.T) {
	srv, fake, token, _ := profileServer(t)

	body := `{"new_email":"uma-new@example.com"}`
	req := httptest.NewRequest(http.MethodPost, "/api/me/email/request-change", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if !fake.sent {
		t.Fatal("expected an e-mail to be sent")
	}
	if fake.to != "uma-new@example.com" {
		t.Errorf("expected e-mail to new address, got %q", fake.to)
	}
}

func TestRequestEmailChange_NoSMTPConfigured400(t *testing.T) {
	database := openServerTestDB(t)
	id, err := db.CreateUser(database, "vic", "password123", "viewer", false)
	if err != nil {
		t.Fatalf("criar usuário: %v", err)
	}
	_ = id
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "vic", "password123")

	body := `{"new_email":"vic-new@example.com"}`
	req := httptest.NewRequest(http.MethodPost, "/api/me/email/request-change", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 without SMTP configured, got %d", w.Code)
	}
}

func TestConfirmEmailChange_ValidCode(t *testing.T) {
	srv, fake, token, id := profileServer(t)
	_ = id

	rbody := `{"new_email":"uma-new@example.com"}`
	rreq := httptest.NewRequest(http.MethodPost, "/api/me/email/request-change", strings.NewReader(rbody))
	rreq.Header.Set("Authorization", "Bearer "+token)
	rreq.Header.Set("Content-Type", "application/json")
	rw := httptest.NewRecorder()
	srv.ServeHTTP(rw, rreq)
	if rw.Code != http.StatusOK {
		t.Fatalf("request-change: expected 200, got %d", rw.Code)
	}

	idx := strings.Index(fake.body, "código de confirmação")
	if idx < 0 {
		t.Fatalf("expected code phrase in email body: %s", fake.body)
	}
	fields := strings.Fields(fake.body)
	code := fields[len(fields)-1]

	cbody := `{"code":"` + code + `"}`
	creq := httptest.NewRequest(http.MethodPost, "/api/me/email/confirm-change", strings.NewReader(cbody))
	creq.Header.Set("Authorization", "Bearer "+token)
	creq.Header.Set("Content-Type", "application/json")
	cw := httptest.NewRecorder()
	srv.ServeHTTP(cw, creq)
	if cw.Code != http.StatusOK && cw.Code != http.StatusNoContent {
		t.Fatalf("confirm-change: expected 200/204, got %d: %s", cw.Code, cw.Body.String())
	}

	// GET /api/me reflects the new e-mail.
	greq := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	greq.Header.Set("Authorization", "Bearer "+token)
	gw := httptest.NewRecorder()
	srv.ServeHTTP(gw, greq)
	var resp struct {
		Email string `json:"email"`
	}
	json.NewDecoder(gw.Body).Decode(&resp)
	if resp.Email != "uma-new@example.com" {
		t.Errorf("expected email updated to uma-new@example.com, got %q", resp.Email)
	}
}

func TestConfirmEmailChange_WrongCodeRejected(t *testing.T) {
	srv, _, token, _ := profileServer(t)

	rbody := `{"new_email":"uma-new@example.com"}`
	rreq := httptest.NewRequest(http.MethodPost, "/api/me/email/request-change", strings.NewReader(rbody))
	rreq.Header.Set("Authorization", "Bearer "+token)
	rreq.Header.Set("Content-Type", "application/json")
	rw := httptest.NewRecorder()
	srv.ServeHTTP(rw, rreq)
	if rw.Code != http.StatusOK {
		t.Fatalf("request-change: expected 200, got %d", rw.Code)
	}

	cbody := `{"code":"000000"}`
	creq := httptest.NewRequest(http.MethodPost, "/api/me/email/confirm-change", strings.NewReader(cbody))
	creq.Header.Set("Authorization", "Bearer "+token)
	creq.Header.Set("Content-Type", "application/json")
	cw := httptest.NewRecorder()
	srv.ServeHTTP(cw, creq)
	if cw.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for wrong code, got %d", cw.Code)
	}
}

func TestConfirmEmailChange_NoPendingCodeRejected(t *testing.T) {
	srv, _, token, _ := profileServer(t)

	cbody := `{"code":"123456"}`
	creq := httptest.NewRequest(http.MethodPost, "/api/me/email/confirm-change", strings.NewReader(cbody))
	creq.Header.Set("Authorization", "Bearer "+token)
	creq.Header.Set("Content-Type", "application/json")
	cw := httptest.NewRecorder()
	srv.ServeHTTP(cw, creq)
	if cw.Code != http.StatusBadRequest {
		t.Errorf("expected 400 with no pending code, got %d", cw.Code)
	}
}
