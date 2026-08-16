package db

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// telegramLinkCodeKey/telegramChatIDKey mirror the password_reset pattern
// (internal/db/passwordreset.go): ephemeral/small per-user values reuse the
// generic user_settings KV table — no dedicated migration.
const (
	telegramLinkCodeKey  = "telegram_link_code"
	telegramChatIDKey    = "telegram_chat_id"
	telegramUsernameKey  = "telegram_username"
	telegramFirstNameKey = "telegram_first_name"
	telegramLastNameKey  = "telegram_last_name"
)

// SetTelegramLinkCode persists a Telegram account-linking code with its
// expiry, as "<code>:<expiry-unix>" in user_settings (key
// "telegram_link_code") — same encoding as SetPasswordResetToken.
func SetTelegramLinkCode(db *DB, userID int64, code string, expiresAt time.Time) error {
	value := code + ":" + strconv.FormatInt(expiresAt.Unix(), 10)
	return setUserSetting(db, userID, telegramLinkCodeKey, value)
}

// FindUserByTelegramLinkCode resolves a pending link code back to the user
// who generated it. Unlike FindUserByPasswordResetToken, this checks
// expiry itself — it's consumed by a background poller (T3), not an HTTP
// handler that could apply that rule on top.
func FindUserByTelegramLinkCode(db *DB, code string) (int64, error) {
	rows, err := db.Query(`SELECT user_id, value FROM user_settings WHERE key=?`, telegramLinkCodeKey)
	if err != nil {
		return 0, fmt.Errorf("find user by telegram link code: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var userID int64
		var value string
		if err := rows.Scan(&userID, &value); err != nil {
			return 0, err
		}
		gotCode, expiresAt, err := parseTelegramLinkCodeValue(value)
		if err != nil || gotCode != code {
			continue
		}
		if time.Now().After(expiresAt) {
			continue
		}
		return userID, nil
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	return 0, fmt.Errorf("telegram link code not found or expired")
}

// ClearTelegramLinkCode removes the user's pending link code, if any.
func ClearTelegramLinkCode(db *DB, userID int64) error {
	_, err := db.Exec(`DELETE FROM user_settings WHERE user_id=? AND key=?`, userID, telegramLinkCodeKey)
	return err
}

func parseTelegramLinkCodeValue(raw string) (string, time.Time, error) {
	idx := strings.LastIndex(raw, ":")
	if idx < 0 {
		return "", time.Time{}, fmt.Errorf("malformed telegram link code value: %q", raw)
	}
	code := raw[:idx]
	unix, err := strconv.ParseInt(raw[idx+1:], 10, 64)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("malformed telegram link code expiry: %w", err)
	}
	return code, time.Unix(unix, 0), nil
}

// GetUserTelegramChatID returns the user's linked Telegram chat_id, or ""
// when not linked.
func GetUserTelegramChatID(db *DB, userID int64) (string, error) {
	return getUserSetting(db, userID, telegramChatIDKey, "")
}

// GetUserTelegramChatInfo returns the user's linked Telegram chat_id plus
// the identity captured at link time (username/first_name/last_name — any
// or all may be "", either because the account has none set, or because
// the link predates this field existing). All four are "" when not linked.
func GetUserTelegramChatInfo(db *DB, userID int64) (chatID, username, firstName, lastName string, err error) {
	if chatID, err = getUserSetting(db, userID, telegramChatIDKey, ""); err != nil {
		return "", "", "", "", err
	}
	if username, err = getUserSetting(db, userID, telegramUsernameKey, ""); err != nil {
		return "", "", "", "", err
	}
	if firstName, err = getUserSetting(db, userID, telegramFirstNameKey, ""); err != nil {
		return "", "", "", "", err
	}
	if lastName, err = getUserSetting(db, userID, telegramLastNameKey, ""); err != nil {
		return "", "", "", "", err
	}
	return chatID, username, firstName, lastName, nil
}

// SetUserTelegramChatInfo persists the user's linked Telegram chat_id and
// identity together — replaces SetUserTelegramChatID (feat/telegram-link-card-dados-chat-live-update,
// T2), since a successful link always carries all of it at once (the
// poller reads them off the same Message.From).
func SetUserTelegramChatInfo(db *DB, userID int64, chatID, username, firstName, lastName string) error {
	if err := setUserSetting(db, userID, telegramChatIDKey, chatID); err != nil {
		return err
	}
	if err := setUserSetting(db, userID, telegramUsernameKey, username); err != nil {
		return err
	}
	if err := setUserSetting(db, userID, telegramFirstNameKey, firstName); err != nil {
		return err
	}
	return setUserSetting(db, userID, telegramLastNameKey, lastName)
}

// ClearUserTelegramChatID unlinks the user's Telegram account — clears the
// chat_id AND the identity fields set alongside it (SetUserTelegramChatInfo),
// so a future re-link with a different Telegram account never shows stale
// name/username from the previous one before the new SetChatInfo call lands.
func ClearUserTelegramChatID(db *DB, userID int64) error {
	_, err := db.Exec(
		`DELETE FROM user_settings WHERE user_id=? AND key IN (?, ?, ?, ?)`,
		userID, telegramChatIDKey, telegramUsernameKey, telegramFirstNameKey, telegramLastNameKey,
	)
	return err
}
