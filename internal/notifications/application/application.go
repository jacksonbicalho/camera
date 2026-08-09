// Package application implements notifications.Sender for the notification
// channel that already existed before this module: persisted in
// user_settings (db.InsertUserNotification) plus a live push so a connected
// client's bell updates immediately.
package application

import (
	"camera/internal/db"
	"camera/internal/notifications"
)

// LivePush notifies a connected client in real time that a new notification
// exists (e.g. via SSE). Defined here (consumer side) so this package does
// not depend on internal/server — *server.Server satisfies it structurally
// via an exported Push method delegating to its private SSE hub.
type LivePush interface {
	Push(userID int64)
}

// Sender is the "application" channel: always enabled, no per-user opt-out —
// it's the in-app bell, the primary way notifications ever reached anyone
// before this module existed.
type Sender struct {
	db   *db.DB
	push LivePush // nil-safe: no live push when not wired
}

// New builds an application Sender. push may be nil (no live push, only
// persistence — e.g. in tests that don't care about the SSE side effect).
func New(database *db.DB, push LivePush) *Sender {
	return &Sender{db: database, push: push}
}

func (s *Sender) Send(n notifications.Notification, userID int64) error {
	if _, err := db.InsertUserNotification(s.db, db.UserNotification{
		UserID:  userID,
		Type:    n.Type,
		Title:   n.Title,
		Message: n.Message,
		Link:    n.Link,
	}); err != nil {
		return err
	}
	if s.push != nil {
		s.push.Push(userID)
	}
	return nil
}
