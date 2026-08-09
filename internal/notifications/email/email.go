// Package email implements notifications.Sender for the e-mail channel: an
// opt-in per user (notify:email_enabled in user_settings), on top of the
// existing internal/email.Sender (used until now only for password reset).
package email

import (
	"camera/internal/db"
	"camera/internal/notifications"
)

// mailer sends a single e-mail. Defined here (consumer side) so this package
// does not depend on internal/email's concrete type — satisfied structurally
// by *email.SMTPSender.
type mailer interface {
	Send(to, subject, body string) error
}

// Sender is the "email" channel: only fires for recipients who opted in
// (notify:email_enabled) and who have an e-mail on file.
type Sender struct {
	db     *db.DB
	mailer mailer
}

// New builds an email Sender. mailer may be nil (e.g. no SMTP configured) —
// Send then no-ops instead of panicking, same as an opted-out recipient.
func New(database *db.DB, m mailer) *Sender {
	return &Sender{db: database, mailer: m}
}

func (s *Sender) Send(n notifications.Notification, userID int64) error {
	if s.mailer == nil {
		return nil
	}
	enabled, err := db.GetUserNotifyEmail(s.db, userID)
	if err != nil || !enabled {
		return err
	}
	to, err := db.GetUserEmail(s.db, userID)
	if err != nil || to == "" {
		return err
	}
	return s.mailer.Send(to, n.Title, n.Message)
}
