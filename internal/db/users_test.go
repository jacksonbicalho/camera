package db_test

import (
	"path/filepath"
	"testing"

	"camera/internal/db"
)

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	dir := t.TempDir()
	database, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func TestCreateAndGetUser(t *testing.T) {
	database := openTestDB(t)

	id, err := db.CreateUser(database, "alice", "senha123", "admin", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if id <= 0 {
		t.Fatalf("id inválido: %d", id)
	}

	u, err := db.GetUserByUsername(database, "alice")
	if err != nil {
		t.Fatalf("GetUserByUsername: %v", err)
	}
	if u.Username != "alice" {
		t.Errorf("username: got %q, want %q", u.Username, "alice")
	}
	if u.Role != "admin" {
		t.Errorf("role: got %q, want %q", u.Role, "admin")
	}
	if u.PasswordHash == "" {
		t.Error("password_hash vazio")
	}
	if u.PasswordHash == "senha123" {
		t.Error("password_hash deve ser hash bcrypt, não texto puro")
	}
}

func TestCreateUser_DuplicateUsername(t *testing.T) {
	database := openTestDB(t)

	if _, err := db.CreateUser(database, "bob", "x", "viewer", false); err != nil {
		t.Fatalf("primeiro CreateUser: %v", err)
	}
	_, err := db.CreateUser(database, "bob", "y", "viewer", false)
	if err == nil {
		t.Error("esperava erro por username duplicado")
	}
}

func TestListUsers(t *testing.T) {
	database := openTestDB(t)

	for _, u := range []struct{ name, role string }{
		{"alice", "admin"},
		{"bob", "viewer"},
		{"carol", "viewer"},
	} {
		if _, err := db.CreateUser(database, u.name, "x", u.role, false); err != nil {
			t.Fatalf("CreateUser %s: %v", u.name, err)
		}
	}

	users, err := db.ListUsers(database)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != 3 {
		t.Errorf("esperava 3 usuários, got %d", len(users))
	}
}

func TestUpdateUser(t *testing.T) {
	database := openTestDB(t)

	id, err := db.CreateUser(database, "dave", "senha", "viewer", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	if err := db.UpdateUser(database, id, "dave2", "novasenha", "admin"); err != nil {
		t.Fatalf("UpdateUser: %v", err)
	}

	u, err := db.GetUserByID(database, id)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if u.Username != "dave2" {
		t.Errorf("username: got %q, want %q", u.Username, "dave2")
	}
	if u.Role != "admin" {
		t.Errorf("role: got %q, want %q", u.Role, "admin")
	}
}

func TestDeleteUser(t *testing.T) {
	database := openTestDB(t)

	id, err := db.CreateUser(database, "eve", "x", "viewer", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	if err := db.DeleteUser(database, id); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}

	_, err = db.GetUserByID(database, id)
	if err == nil {
		t.Error("esperava erro ao buscar usuário deletado")
	}
}

func TestSetAndGetUserCameras(t *testing.T) {
	database := openTestDB(t)

	id, err := db.CreateUser(database, "frank", "x", "viewer", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	cameras := []string{"cam1", "cam2", "cam3"}
	if err := db.SetUserCameras(database, id, cameras); err != nil {
		t.Fatalf("SetUserCameras: %v", err)
	}

	got, err := db.GetUserCameras(database, id)
	if err != nil {
		t.Fatalf("GetUserCameras: %v", err)
	}
	if len(got) != len(cameras) {
		t.Errorf("esperava %d câmeras, got %d", len(cameras), len(got))
	}

	// substituir com lista menor
	if err := db.SetUserCameras(database, id, []string{"cam1"}); err != nil {
		t.Fatalf("SetUserCameras (substituição): %v", err)
	}
	got2, _ := db.GetUserCameras(database, id)
	if len(got2) != 1 {
		t.Errorf("após substituição: esperava 1, got %d", len(got2))
	}
}

func TestSetAndGetUserEmail(t *testing.T) {
	database := openTestDB(t)
	id, err := db.CreateUser(database, "henry", "x", "viewer", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	email, err := db.GetUserEmail(database, id)
	if err != nil {
		t.Fatalf("GetUserEmail: %v", err)
	}
	if email != "" {
		t.Errorf("expected empty email by default, got %q", email)
	}

	if err := db.SetUserEmail(database, id, "henry@example.com"); err != nil {
		t.Fatalf("SetUserEmail: %v", err)
	}
	email, err = db.GetUserEmail(database, id)
	if err != nil {
		t.Fatalf("GetUserEmail: %v", err)
	}
	if email != "henry@example.com" {
		t.Errorf("expected 'henry@example.com', got %q", email)
	}
}

func TestSetUserEmail_RejectsDuplicate(t *testing.T) {
	database := openTestDB(t)
	id1, _ := db.CreateUser(database, "ivan", "x", "viewer", false)
	id2, _ := db.CreateUser(database, "julia", "x", "viewer", false)

	if err := db.SetUserEmail(database, id1, "shared@example.com"); err != nil {
		t.Fatalf("SetUserEmail id1: %v", err)
	}
	if err := db.SetUserEmail(database, id2, "shared@example.com"); err == nil {
		t.Error("expected error setting a duplicate email for a different user")
	}
}

func TestSetUserEmail_AllowsSameUserToKeepItsOwnEmail(t *testing.T) {
	database := openTestDB(t)
	id, _ := db.CreateUser(database, "karen", "x", "viewer", false)

	if err := db.SetUserEmail(database, id, "karen@example.com"); err != nil {
		t.Fatalf("first SetUserEmail: %v", err)
	}
	if err := db.SetUserEmail(database, id, "karen@example.com"); err != nil {
		t.Errorf("re-setting the same email for the same user should not error: %v", err)
	}
}

func TestSetAndGetUserName(t *testing.T) {
	database := openTestDB(t)
	id, err := db.CreateUser(database, "liam", "x", "viewer", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	name, err := db.GetUserName(database, id)
	if err != nil {
		t.Fatalf("GetUserName: %v", err)
	}
	if name != "" {
		t.Errorf("expected empty name by default, got %q", name)
	}

	if err := db.SetUserName(database, id, "Liam Silva"); err != nil {
		t.Fatalf("SetUserName: %v", err)
	}
	name, err = db.GetUserName(database, id)
	if err != nil {
		t.Fatalf("GetUserName: %v", err)
	}
	if name != "Liam Silva" {
		t.Errorf("expected 'Liam Silva', got %q", name)
	}
}

func TestGetUserByLogin_MatchesUsername(t *testing.T) {
	database := openTestDB(t)
	if _, err := db.CreateUser(database, "mia", "x", "viewer", false); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	u, err := db.GetUserByLogin(database, "mia")
	if err != nil {
		t.Fatalf("GetUserByLogin: %v", err)
	}
	if u.Username != "mia" {
		t.Errorf("expected username 'mia', got %q", u.Username)
	}
}

func TestGetUserByLogin_MatchesEmail(t *testing.T) {
	database := openTestDB(t)
	id, err := db.CreateUser(database, "noah", "x", "viewer", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if err := db.SetUserEmail(database, id, "noah@example.com"); err != nil {
		t.Fatalf("SetUserEmail: %v", err)
	}

	u, err := db.GetUserByLogin(database, "noah@example.com")
	if err != nil {
		t.Fatalf("GetUserByLogin: %v", err)
	}
	if u.Username != "noah" {
		t.Errorf("expected username 'noah', got %q", u.Username)
	}
}

func TestGetUserByLogin_NotFound(t *testing.T) {
	database := openTestDB(t)
	_, err := db.GetUserByLogin(database, "ghost@example.com")
	if err == nil {
		t.Error("expected error for unknown login identifier")
	}
}

func TestCheckPassword(t *testing.T) {
	database := openTestDB(t)

	if _, err := db.CreateUser(database, "grace", "minha-senha", "viewer", false); err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	u, _ := db.GetUserByUsername(database, "grace")

	if !db.CheckPassword(u.PasswordHash, "minha-senha") {
		t.Error("CheckPassword deveria retornar true para senha correta")
	}
	if db.CheckPassword(u.PasswordHash, "errada") {
		t.Error("CheckPassword deveria retornar false para senha errada")
	}
}
