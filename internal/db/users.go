package db

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// BcryptCost is the work factor used when hashing passwords.
// Tests may override this to bcrypt.MinCost (4) for speed.
var BcryptCost = 12

// User represents a row from the users table. Email and Name are not columns
// on users — they live in user_settings (keys "email"/"name", see
// GetUserEmail/GetUserName) and are populated here as a convenience.
type User struct {
	ID                 int64
	Username           string
	PasswordHash       string
	Role               string
	CreatedAt          time.Time
	MustChangePassword bool
	Email              string
	Name               string
}

// CreateUser inserts a new user, hashing the password with bcrypt. Returns
// the new user's ID. When mustChange is true the user must reset the password
// on first login.
func CreateUser(db *DB, username, password, role string, mustChange bool) (int64, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return 0, fmt.Errorf("hash password: %w", err)
	}

	res, err := db.Exec(
		`INSERT INTO users(username, password_hash, role, must_change_password) VALUES(?,?,?,?)`,
		username, string(hash), role, boolToInt(mustChange),
	)
	if err != nil {
		return 0, fmt.Errorf("insert user: %w", err)
	}
	return res.LastInsertId()
}

// ClearMustChangePassword resets the must_change_password flag and updates the
// password hash for the given user.
func ClearMustChangePassword(db *DB, id int64, newPassword string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), BcryptCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	_, err = db.Exec(
		`UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?`,
		string(hash), id,
	)
	return err
}

// GetUserByID returns the user with the given ID.
func GetUserByID(db *DB, id int64) (User, error) {
	u, err := scanUser(db.QueryRow(
		`SELECT id, username, password_hash, role, created_at, must_change_password FROM users WHERE id=?`, id,
	))
	if err != nil {
		return User{}, err
	}
	return withEmailAndName(db, u)
}

// GetUserByUsername returns the user with the given username.
func GetUserByUsername(db *DB, username string) (User, error) {
	u, err := scanUser(db.QueryRow(
		`SELECT id, username, password_hash, role, created_at, must_change_password FROM users WHERE username=?`, username,
	))
	if err != nil {
		return User{}, err
	}
	return withEmailAndName(db, u)
}

// GetUserByLogin returns the user matching identifier as either their
// username or their email (user_settings key "email"). Tries username first.
func GetUserByLogin(db *DB, identifier string) (User, error) {
	u, err := GetUserByUsername(db, identifier)
	if err == nil {
		return u, nil
	}
	var userID int64
	lookupErr := db.QueryRow(
		`SELECT user_id FROM user_settings WHERE key='email' AND value=?`, identifier,
	).Scan(&userID)
	if lookupErr != nil {
		return User{}, fmt.Errorf("user not found")
	}
	return GetUserByID(db, userID)
}

// withEmailAndName fills in u.Email/u.Name from user_settings.
func withEmailAndName(db *DB, u User) (User, error) {
	email, err := GetUserEmail(db, u.ID)
	if err != nil {
		return User{}, err
	}
	name, err := GetUserName(db, u.ID)
	if err != nil {
		return User{}, err
	}
	u.Email = email
	u.Name = name
	return u, nil
}

// GetUserEmail returns the user's email (default "" — not every user has one).
func GetUserEmail(db *DB, userID int64) (string, error) {
	return getUserSetting(db, userID, "email", "")
}

// SetUserEmail persists the user's email. Rejects the change if another user
// already has this email (user_settings has no native uniqueness constraint
// on value, so uniqueness is enforced here).
func SetUserEmail(db *DB, userID int64, email string) error {
	var existingUserID int64
	err := db.QueryRow(
		`SELECT user_id FROM user_settings WHERE key='email' AND value=?`, email,
	).Scan(&existingUserID)
	if err == nil && existingUserID != userID {
		return fmt.Errorf("email %q already in use", email)
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("check existing email: %w", err)
	}
	return setUserSetting(db, userID, "email", email)
}

// GetUserName returns the user's display name (default "").
func GetUserName(db *DB, userID int64) (string, error) {
	return getUserSetting(db, userID, "name", "")
}

// SetUserName persists the user's display name. No uniqueness constraint.
func SetUserName(db *DB, userID int64, name string) error {
	return setUserSetting(db, userID, "name", name)
}

// SetUsername renames the user's login. `users.username` already has a DB-level UNIQUE
// constraint, but we pre-check (same convention as SetUserEmail) for a friendly error
// instead of surfacing the raw driver error.
func SetUsername(db *DB, userID int64, username string) error {
	var existingUserID int64
	err := db.QueryRow(`SELECT id FROM users WHERE username=?`, username).Scan(&existingUserID)
	if err == nil && existingUserID != userID {
		return fmt.Errorf("username %q already in use", username)
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("check existing username: %w", err)
	}
	_, err = db.Exec(`UPDATE users SET username=? WHERE id=?`, username, userID)
	return err
}

func scanUser(row *sql.Row) (User, error) {
	var u User
	var createdAt string
	var mustChange int
	if err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &createdAt, &mustChange); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, fmt.Errorf("user not found")
		}
		return User{}, fmt.Errorf("scan user: %w", err)
	}
	if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
		u.CreatedAt = t
	}
	u.MustChangePassword = mustChange != 0
	return u, nil
}

// ListUsers returns all users ordered by id.
func ListUsers(db *DB) ([]User, error) {
	rows, err := db.Query(
		`SELECT id, username, password_hash, role, created_at, must_change_password FROM users ORDER BY id`,
	)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		var createdAt string
		var mustChange int
		if err := rows.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &createdAt, &mustChange); err != nil {
			return nil, fmt.Errorf("scan user row: %w", err)
		}
		if t, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
			u.CreatedAt = t
		}
		u.MustChangePassword = mustChange != 0
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i, u := range users {
		filled, err := withEmailAndName(db, u)
		if err != nil {
			return nil, err
		}
		users[i] = filled
	}
	return users, nil
}

// PatchUser updates username and role. When newPassword is non-empty, also
// replaces the password hash; otherwise the existing hash is preserved.
func PatchUser(db *DB, id int64, username, role, newPassword string) error {
	if newPassword != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), BcryptCost)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}
		_, err = db.Exec(
			`UPDATE users SET username=?, password_hash=?, role=? WHERE id=?`,
			username, string(hash), role, id,
		)
		return err
	}
	_, err := db.Exec(
		`UPDATE users SET username=?, role=? WHERE id=?`,
		username, role, id,
	)
	return err
}

// DeleteUser removes the user and cascades to user_settings.
func DeleteUser(db *DB, id int64) error {
	_, err := db.Exec(`DELETE FROM users WHERE id=?`, id)
	return err
}

const cameraKeyPrefix = "camera:"

// SetUserCameras replaces the set of camera IDs allowed for a viewer.
// Passing an empty slice removes all permissions. Stored in user_settings as
// one key per camera ("camera:<id>" = "1") rather than a user_cameras table.
func SetUserCameras(db *DB, userID int64, cameraIDs []string) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.Exec(
		`DELETE FROM user_settings WHERE user_id=? AND key LIKE ?`, userID, cameraKeyPrefix+"%",
	); err != nil {
		return err
	}
	for _, cid := range cameraIDs {
		if _, err := tx.Exec(
			`INSERT INTO user_settings(user_id, key, value) VALUES(?,?,?)`, userID, cameraKeyPrefix+cid, "1",
		); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// GetUserCameras returns the list of camera IDs accessible to a user.
func GetUserCameras(db *DB, userID int64) ([]string, error) {
	rows, err := db.Query(
		`SELECT key FROM user_settings WHERE user_id=? AND key LIKE ? ORDER BY key`,
		userID, cameraKeyPrefix+"%",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		ids = append(ids, strings.TrimPrefix(key, cameraKeyPrefix))
	}
	return ids, rows.Err()
}

// UserHasCamera reports whether the user has been granted access to cameraID.
// A single lookup by the user_settings primary key (user_id, key).
func UserHasCamera(db *DB, userID int64, cameraID string) (bool, error) {
	var one int
	err := db.QueryRow(
		`SELECT 1 FROM user_settings WHERE user_id=? AND key=? LIMIT 1`, userID, cameraKeyPrefix+cameraID,
	).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// CheckPassword returns true when the plain-text password matches the bcrypt hash.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
