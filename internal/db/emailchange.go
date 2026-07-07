package db

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

const emailChangeKey = "email_change"

// SetEmailChangeCode persists a pending e-mail change (new address + confirmation code +
// expiry) as "<new_email>:<code>:<expiry-unix>" in user_settings (key "email_change") — same
// single-ephemeral-value convention as password_reset, just with an extra field.
func SetEmailChangeCode(db *DB, userID int64, newEmail, code string, expiresAt time.Time) error {
	value := newEmail + ":" + code + ":" + strconv.FormatInt(expiresAt.Unix(), 10)
	return setUserSetting(db, userID, emailChangeKey, value)
}

// GetEmailChangeCode returns the user's pending new e-mail, confirmation code and its expiry,
// or ("", "", zero time, nil) when none is pending.
func GetEmailChangeCode(db *DB, userID int64) (newEmail, code string, expiresAt time.Time, err error) {
	raw, err := getUserSetting(db, userID, emailChangeKey, "")
	if err != nil {
		return "", "", time.Time{}, err
	}
	if raw == "" {
		return "", "", time.Time{}, nil
	}
	return parseEmailChangeValue(raw)
}

// ClearEmailChangeCode removes the user's pending e-mail change, if any.
func ClearEmailChangeCode(db *DB, userID int64) error {
	_, err := db.Exec(`DELETE FROM user_settings WHERE user_id=? AND key=?`, userID, emailChangeKey)
	return err
}

// parseEmailChangeValue splits "<new_email>:<code>:<expiry-unix>" from the right (two cuts) —
// same spirit as parsePasswordResetValue, adapted for a 3rd field.
func parseEmailChangeValue(raw string) (newEmail, code string, expiresAt time.Time, err error) {
	lastColon := strings.LastIndex(raw, ":")
	if lastColon < 0 {
		return "", "", time.Time{}, fmt.Errorf("malformed email change value: %q", raw)
	}
	unix, err := strconv.ParseInt(raw[lastColon+1:], 10, 64)
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("malformed email change expiry: %w", err)
	}
	rest := raw[:lastColon]
	secondLastColon := strings.LastIndex(rest, ":")
	if secondLastColon < 0 {
		return "", "", time.Time{}, fmt.Errorf("malformed email change value: %q", raw)
	}
	return rest[:secondLastColon], rest[secondLastColon+1:], time.Unix(unix, 0), nil
}
