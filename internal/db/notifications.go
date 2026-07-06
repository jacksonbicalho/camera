package db

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// UserNotification is a persisted, per-user notification. ReadAt is nil while unread.
type UserNotification struct {
	ID        int64
	UserID    int64
	Type      string // success | error | warning | info
	Title     string
	Message   string
	Link      string
	CreatedAt time.Time
	ReadAt    *time.Time
}

// notificationValue is UserNotification's JSON encoding, stored as the value
// of a "notification:<id>" key in user_settings.
type notificationValue struct {
	Type      string  `json:"type"`
	Title     string  `json:"title,omitempty"`
	Message   string  `json:"message"`
	Link      string  `json:"link,omitempty"`
	CreatedAt string  `json:"created_at"`
	ReadAt    *string `json:"read_at,omitempty"`
}

const notificationKeyPrefix = "notification:"
const notificationSeqKey = "notification_seq"

func (n UserNotification) toValue() notificationValue {
	v := notificationValue{
		Type:      n.Type,
		Title:     n.Title,
		Message:   n.Message,
		Link:      n.Link,
		CreatedAt: n.CreatedAt.UTC().Format(time.RFC3339),
	}
	if n.ReadAt != nil {
		s := n.ReadAt.UTC().Format(time.RFC3339)
		v.ReadAt = &s
	}
	return v
}

func notificationFromValue(userID, id int64, raw string) (UserNotification, error) {
	var v notificationValue
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		return UserNotification{}, fmt.Errorf("decode notification: %w", err)
	}
	n := UserNotification{
		ID:      id,
		UserID:  userID,
		Type:    v.Type,
		Title:   v.Title,
		Message: v.Message,
		Link:    v.Link,
	}
	n.CreatedAt, _ = time.Parse(time.RFC3339, v.CreatedAt)
	if v.ReadAt != nil {
		if t, err := time.Parse(time.RFC3339, *v.ReadAt); err == nil {
			n.ReadAt = &t
		}
	}
	return n, nil
}

// nextNotificationID increments the per-user notification_seq key inside tx
// and returns the new id — keeps ids as plain int64 (API/JSON contract
// unchanged) instead of switching to a UUID.
func nextNotificationID(tx *sql.Tx, userID int64) (int64, error) {
	var raw string
	err := tx.QueryRow(
		`SELECT value FROM user_settings WHERE user_id=? AND key=?`, userID, notificationSeqKey,
	).Scan(&raw)
	var cur int64
	if err == nil {
		cur, _ = strconv.ParseInt(raw, 10, 64)
	} else if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	next := cur + 1
	if _, err := tx.Exec(
		`INSERT OR REPLACE INTO user_settings(user_id, key, value) VALUES(?,?,?)`,
		userID, notificationSeqKey, strconv.FormatInt(next, 10),
	); err != nil {
		return 0, err
	}
	return next, nil
}

// InsertUserNotification stores a notification for a user and returns its id.
// CreatedAt defaults to now and Type to "info" when unset.
func InsertUserNotification(db *DB, n UserNotification) (int64, error) {
	if n.CreatedAt.IsZero() {
		n.CreatedAt = time.Now().UTC()
	}
	if n.Type == "" {
		n.Type = "info"
	}
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck

	id, err := nextNotificationID(tx, n.UserID)
	if err != nil {
		return 0, fmt.Errorf("next notification id: %w", err)
	}
	raw, err := json.Marshal(n.toValue())
	if err != nil {
		return 0, err
	}
	if _, err := tx.Exec(
		`INSERT INTO user_settings(user_id, key, value) VALUES(?,?,?)`,
		n.UserID, notificationKeyPrefix+strconv.FormatInt(id, 10), string(raw),
	); err != nil {
		return 0, fmt.Errorf("insert user notification: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return id, nil
}

// ListUserNotifications returns a user's notifications, newest first.
func ListUserNotifications(db *DB, userID int64) ([]UserNotification, error) {
	rows, err := db.Query(
		`SELECT key, value FROM user_settings WHERE user_id=? AND key LIKE ?`,
		userID, notificationKeyPrefix+"%",
	)
	if err != nil {
		return nil, fmt.Errorf("list user notifications: %w", err)
	}
	defer rows.Close()

	var out []UserNotification
	for rows.Next() {
		var key, raw string
		if err := rows.Scan(&key, &raw); err != nil {
			return nil, fmt.Errorf("scan user notification: %w", err)
		}
		id, err := strconv.ParseInt(strings.TrimPrefix(key, notificationKeyPrefix), 10, 64)
		if err != nil {
			continue
		}
		n, err := notificationFromValue(userID, id, raw)
		if err != nil {
			continue
		}
		out = append(out, n)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool {
		if !out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].CreatedAt.After(out[j].CreatedAt)
		}
		return out[i].ID > out[j].ID
	})
	return out, nil
}

// CountUnreadNotifications returns how many of the user's notifications are unread.
func CountUnreadNotifications(db *DB, userID int64) (int, error) {
	list, err := ListUserNotifications(db, userID)
	if err != nil {
		return 0, fmt.Errorf("count unread notifications: %w", err)
	}
	n := 0
	for _, x := range list {
		if x.ReadAt == nil {
			n++
		}
	}
	return n, nil
}

// MarkNotificationRead marks a single notification read. Idempotent if already
// read; returns an error if the notification does not belong to the user.
func MarkNotificationRead(db *DB, userID, id int64) error {
	key := notificationKeyPrefix + strconv.FormatInt(id, 10)
	var raw string
	err := db.QueryRow(`SELECT value FROM user_settings WHERE user_id=? AND key=?`, userID, key).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("notification %d not found for user %d", id, userID)
	}
	if err != nil {
		return fmt.Errorf("mark notification read: %w", err)
	}
	n, err := notificationFromValue(userID, id, raw)
	if err != nil {
		return err
	}
	if n.ReadAt != nil {
		return nil // already read — idempotent
	}
	now := time.Now().UTC()
	n.ReadAt = &now
	updated, err := json.Marshal(n.toValue())
	if err != nil {
		return err
	}
	if _, err := db.Exec(`UPDATE user_settings SET value=? WHERE user_id=? AND key=?`, string(updated), userID, key); err != nil {
		return fmt.Errorf("mark notification read: %w", err)
	}
	return nil
}

// MarkAllNotificationsRead marks all of the user's unread notifications read.
func MarkAllNotificationsRead(db *DB, userID int64) error {
	list, err := ListUserNotifications(db, userID)
	if err != nil {
		return fmt.Errorf("mark all notifications read: %w", err)
	}
	now := time.Now().UTC()
	for _, n := range list {
		if n.ReadAt != nil {
			continue
		}
		n.ReadAt = &now
		raw, err := json.Marshal(n.toValue())
		if err != nil {
			return err
		}
		key := notificationKeyPrefix + strconv.FormatInt(n.ID, 10)
		if _, err := db.Exec(`UPDATE user_settings SET value=? WHERE user_id=? AND key=?`, string(raw), userID, key); err != nil {
			return fmt.Errorf("mark all notifications read: %w", err)
		}
	}
	return nil
}

// DeleteUserNotification removes a single notification owned by the user.
func DeleteUserNotification(db *DB, userID, id int64) error {
	key := notificationKeyPrefix + strconv.FormatInt(id, 10)
	res, err := db.Exec(`DELETE FROM user_settings WHERE user_id=? AND key=?`, userID, key)
	if err != nil {
		return fmt.Errorf("delete user notification: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("notification %d not found for user %d", id, userID)
	}
	return nil
}

// DeleteAllUserNotifications removes all notifications of the user.
func DeleteAllUserNotifications(db *DB, userID int64) error {
	_, err := db.Exec(`DELETE FROM user_settings WHERE user_id=? AND key LIKE ?`, userID, notificationKeyPrefix+"%")
	if err != nil {
		return fmt.Errorf("delete all user notifications: %w", err)
	}
	return nil
}
