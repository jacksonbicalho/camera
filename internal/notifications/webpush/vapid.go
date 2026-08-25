// Package webpush implements notifications.Sender for real Web Push
// delivery (Service Worker + Push API) — the only channel that reaches a
// device with the app fully closed, unlike the in-app bell (SSE, requires
// the page alive) or a plain browser Notification triggered from JS running
// in the page. Mirrors internal/notifications/telegram's shape.
package webpush

import (
	"camera/internal/db"

	webpushgo "github.com/SherClockHolmes/webpush-go"
)

const (
	vapidPublicKeyConfigKey  = "push.vapid_public_key"
	vapidPrivateKeyConfigKey = "push.vapid_private_key"
)

// GetOrCreateVAPIDKeys returns the instance's VAPID key pair, generating and
// persisting it on first use. Unlike the JWT secret (regenerated every
// boot), these keys MUST be stable across restarts — a browser subscription
// is bound to the public key used at PushManager.subscribe() time; rotating
// it invalidates every existing subscription.
func GetOrCreateVAPIDKeys(d *db.DB) (public, private string, err error) {
	all, err := db.GetAllConfig(d)
	if err != nil {
		return "", "", err
	}
	if pub, ok := all[vapidPublicKeyConfigKey]; ok {
		return pub, all[vapidPrivateKeyConfigKey], nil
	}

	priv, pub, err := webpushgo.GenerateVAPIDKeys()
	if err != nil {
		return "", "", err
	}
	if err := db.SetConfig(d, vapidPublicKeyConfigKey, pub); err != nil {
		return "", "", err
	}
	if err := db.SetConfig(d, vapidPrivateKeyConfigKey, priv); err != nil {
		return "", "", err
	}
	return pub, priv, nil
}
