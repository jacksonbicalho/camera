package webpush

import (
	"encoding/json"
	"net/http"

	"camera/internal/db"
	"camera/internal/notifications"

	webpushgo "github.com/SherClockHolmes/webpush-go"
)

// sendFunc matches webpushgo.SendNotification's signature — injected so
// Sender is testable without a real push service round-trip.
type sendFunc func(message []byte, s *webpushgo.Subscription, options *webpushgo.Options) (*http.Response, error)

// payload is the JSON body delivered to the browser's push event (read via
// event.data.json() in the Service Worker) — kept minimal, just what the SW
// needs to build the OS notification.
type payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Link  string `json:"link"`
}

// Sender is the "webpush" channel: fires for every subscription (device)
// the recipient has registered — unlike Telegram (single chat_id, explicit
// opt-in), a user's browser notification permission IS the opt-in, and a
// user may have several devices subscribed at once.
type Sender struct {
	db              *db.DB
	vapidPublicKey  string
	vapidPrivateKey string
	send            sendFunc
}

// New builds a webpush Sender. vapidPublicKey/vapidPrivateKey come from
// GetOrCreateVAPIDKeys. send may be nil (e.g. VAPID keys unavailable) —
// Send then no-ops instead of panicking, same convention as
// internal/notifications/telegram.
func New(database *db.DB, vapidPublicKey, vapidPrivateKey string, send sendFunc) *Sender {
	return &Sender{db: database, vapidPublicKey: vapidPublicKey, vapidPrivateKey: vapidPrivateKey, send: send}
}

func (s *Sender) Send(n notifications.Notification, userID int64) error {
	if s.send == nil {
		return nil
	}
	subs, err := db.ListPushSubscriptionsForUser(s.db, userID)
	if err != nil {
		return err
	}
	if len(subs) == 0 {
		return nil
	}

	body, err := json.Marshal(payload{Title: n.Title, Body: n.Message, Link: n.Link})
	if err != nil {
		return err
	}

	opts := &webpushgo.Options{VAPIDPublicKey: s.vapidPublicKey, VAPIDPrivateKey: s.vapidPrivateKey}
	for _, sub := range subs {
		resp, err := s.send(body, &webpushgo.Subscription{
			Endpoint: sub.Endpoint,
			Keys:     webpushgo.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
		}, opts)
		if err != nil {
			continue
		}
		resp.Body.Close()
		// 404/410: o navegador invalidou o endpoint (desinstalou, revogou
		// permissão, etc.) — o serviço de push nunca mais vai aceitar esse
		// endpoint, então a subscription é lixo permanente a partir daqui.
		if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
			_ = db.DeletePushSubscriptionByEndpoint(s.db, sub.Endpoint)
		}
	}
	return nil
}
