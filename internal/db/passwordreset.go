package db

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

const passwordResetKey = "password_reset"

// SetPasswordResetToken persists a password-reset token with its expiry, as
// "<token>:<expiry-unix>" in user_settings (key "password_reset") — no new
// table for a single, ephemeral, per-user value.
func SetPasswordResetToken(db *DB, userID int64, token string, expiresAt time.Time) error {
	value := token + ":" + strconv.FormatInt(expiresAt.Unix(), 10)
	return setUserSetting(db, userID, passwordResetKey, value)
}

// GetPasswordResetToken returns the user's current reset token and its
// expiry, or ("", zero time, nil) when none is set.
func GetPasswordResetToken(db *DB, userID int64) (string, time.Time, error) {
	raw, err := getUserSetting(db, userID, passwordResetKey, "")
	if err != nil {
		return "", time.Time{}, err
	}
	if raw == "" {
		return "", time.Time{}, nil
	}
	return parsePasswordResetValue(raw)
}

// ClearPasswordResetToken removes the user's reset token, if any.
func ClearPasswordResetToken(db *DB, userID int64) error {
	_, err := db.Exec(`DELETE FROM user_settings WHERE user_id=? AND key=?`, userID, passwordResetKey)
	return err
}

// FindUserByPasswordResetToken looks up which user owns a given reset token.
// Volume is low (one row per user with a pending reset), so a full scan of
// the password_reset keys is fine — no dedicated index.
func FindUserByPasswordResetToken(db *DB, token string) (int64, error) {
	rows, err := db.Query(`SELECT user_id, value FROM user_settings WHERE key=?`, passwordResetKey)
	if err != nil {
		return 0, fmt.Errorf("find user by reset token: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var userID int64
		var value string
		if err := rows.Scan(&userID, &value); err != nil {
			return 0, err
		}
		tok, _, err := parsePasswordResetValue(value)
		if err != nil {
			continue
		}
		if tok == token {
			return userID, nil
		}
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	return 0, fmt.Errorf("token not found")
}

func parsePasswordResetValue(raw string) (string, time.Time, error) {
	idx := strings.LastIndex(raw, ":")
	if idx < 0 {
		return "", time.Time{}, fmt.Errorf("malformed password reset value: %q", raw)
	}
	token := raw[:idx]
	unix, err := strconv.ParseInt(raw[idx+1:], 10, 64)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("malformed password reset expiry: %w", err)
	}
	return token, time.Unix(unix, 0), nil
}
