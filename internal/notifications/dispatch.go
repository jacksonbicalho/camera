// Package notifications is the single place in the app that knows how to fan
// a notification out to every channel ("sender") a recipient has configured.
// Resolving WHO should be notified stays with the caller — the existing call
// sites (update available, state transition, disk usage) each have their own,
// mutually incompatible recipient logic; this package only knows HOW to
// deliver, once a resolved list of recipients is handed to it.
package notifications

import "log/slog"

// Notification is a single message to fan out to zero or more recipients.
type Notification struct {
	UserIDs []int64
	Type    string // success | error | warning | info — mirrors db.UserNotification
	Title   string
	Message string
	Link    string
	// ImagePath is an optional absolute filesystem path to an image (e.g. a
	// motion-event snapshot) to attach, for senders that support it — most
	// senders (application, email) simply ignore it.
	ImagePath string
}

// Sender delivers a Notification to a single recipient through one channel
// (application, email, ...). Implementations decide for themselves whether
// they apply to userID (e.g. an opt-in preference) — returning nil (no-op)
// rather than an error when they don't.
type Sender interface {
	Send(n Notification, userID int64) error
}

// Dispatcher fans a Notification out to every configured Sender.
type Dispatcher struct {
	log     *slog.Logger
	senders []Sender
}

// NewDispatcher builds a Dispatcher with the given senders, tried in order for
// every recipient. A Dispatcher with zero senders is valid — Notify becomes a
// no-op — useful when, e.g., no email sender is configured.
func NewDispatcher(log *slog.Logger, senders ...Sender) *Dispatcher {
	return &Dispatcher{log: log, senders: senders}
}

// Notify fans n out to every recipient × every configured sender. A failing
// sender is logged and does not stop the others — neither for the same
// recipient nor for the remaining recipients.
func (d *Dispatcher) Notify(n Notification) {
	for _, uid := range n.UserIDs {
		for _, s := range d.senders {
			if err := s.Send(n, uid); err != nil && d.log != nil {
				d.log.Warn("notifications: sender failed", "user_id", uid, "error", err)
			}
		}
	}
}
