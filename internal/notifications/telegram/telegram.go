// Package telegram implements notifications.Sender for the Telegram channel:
// only fires when the extension is active for this instance
// (db.GetExtensionActive) and the recipient has a chat_id linked
// (db.GetUserTelegramChatID) — mirrors internal/notifications/email.Sender.
package telegram

import (
	"camera/internal/db"
	"camera/internal/notifications"
)

// messenger sends a single Telegram message. Defined here (consumer side) so
// this package does not depend on internal/extensions/telegram's concrete
// type — satisfied structurally by *telegram.Client.
type messenger interface {
	SendMessage(chatID, text string) error
}

// Sender is the "telegram" channel: only fires for recipients when the
// extension is active for the instance and they have a chat_id linked.
type Sender struct {
	db     *db.DB
	client messenger
}

// New builds a telegram Sender. client may be nil (e.g. no bot token
// configured) — Send then no-ops instead of panicking.
func New(database *db.DB, c messenger) *Sender {
	return &Sender{db: database, client: c}
}

func (s *Sender) Send(n notifications.Notification, userID int64) error {
	if s.client == nil {
		return nil
	}
	active, err := db.GetExtensionActive(s.db, "telegram")
	if err != nil || !active {
		return err
	}
	chatID, err := db.GetUserTelegramChatID(s.db, userID)
	if err != nil || chatID == "" {
		return err
	}
	return s.client.SendMessage(chatID, n.Message)
}
