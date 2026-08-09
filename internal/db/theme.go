package db

import (
	"database/sql"
	"errors"
	"fmt"
)

// getUserSetting returns the value stored for (userID, key) in user_settings,
// or def when no row exists.
func getUserSetting(db *DB, userID int64, key, def string) (string, error) {
	var value string
	err := db.QueryRow(`SELECT value FROM user_settings WHERE user_id=? AND key=?`, userID, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return def, nil
	}
	if err != nil {
		return "", fmt.Errorf("get user setting %q: %w", key, err)
	}
	return value, nil
}

// setUserSetting upserts (userID, key, value) into user_settings. Fails if
// userID does not exist (FK constraint — PRAGMA foreign_keys=ON).
func setUserSetting(db *DB, userID int64, key, value string) error {
	if _, err := db.Exec(
		`INSERT OR REPLACE INTO user_settings (user_id, key, value) VALUES (?, ?, ?)`,
		userID, key, value,
	); err != nil {
		return fmt.Errorf("set user setting %q: %w", key, err)
	}
	return nil
}

// GetUserTheme returns the user's UI theme preference (default 'dark').
func GetUserTheme(db *DB, userID int64) (string, error) {
	return getUserSetting(db, userID, "theme", "dark")
}

// SetUserTheme persists the user's UI theme preference. Validation of allowed
// values is done by the caller.
func SetUserTheme(db *DB, userID int64, theme string) error {
	return setUserSetting(db, userID, "theme", theme)
}

// GetUserAccentColor returns the user's UI accent color preference (default
// 'default' — no override, falls back to the base --color-primary).
func GetUserAccentColor(db *DB, userID int64) (string, error) {
	return getUserSetting(db, userID, "accent", "default")
}

// SetUserAccentColor persists the user's UI accent color preference.
// Validation of allowed values is done by the caller.
func SetUserAccentColor(db *DB, userID int64, accent string) error {
	return setUserSetting(db, userID, "accent", accent)
}

// GetUserNotifyEmail returns whether the user opted in to receive
// notifications by e-mail (default false — opt-in, not opt-out).
func GetUserNotifyEmail(db *DB, userID int64) (bool, error) {
	v, err := getUserSetting(db, userID, "notify:email_enabled", "0")
	return v == "1", err
}

// SetUserNotifyEmail persists the user's e-mail notification preference.
func SetUserNotifyEmail(db *DB, userID int64, enabled bool) error {
	v := "0"
	if enabled {
		v = "1"
	}
	return setUserSetting(db, userID, "notify:email_enabled", v)
}
