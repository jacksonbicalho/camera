package db

// PushSubscription is one browser/device subscribed to Web Push for a user
// — a user can have several (one per device/browser that opted in).
type PushSubscription struct {
	ID       int64
	UserID   int64
	Endpoint string
	P256dh   string
	Auth     string
}

// UpsertPushSubscription persists a subscription, keyed by endpoint (unique
// per browser/device install) — subscribing again from the same device
// updates the keys in place instead of creating a duplicate row.
func UpsertPushSubscription(d *DB, userID int64, endpoint, p256dh, auth string) error {
	_, err := d.Exec(
		`INSERT INTO push_subscriptions(user_id, endpoint, p256dh, auth) VALUES(?,?,?,?)
		 ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
		userID, endpoint, p256dh, auth,
	)
	return err
}

// ListPushSubscriptionsForUser returns every subscription registered for
// userID (one per device/browser that has notifications enabled).
func ListPushSubscriptionsForUser(d *DB, userID int64) ([]PushSubscription, error) {
	rows, err := d.Query(
		`SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=? ORDER BY id`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []PushSubscription
	for rows.Next() {
		var s PushSubscription
		if err := rows.Scan(&s.ID, &s.UserID, &s.Endpoint, &s.P256dh, &s.Auth); err != nil {
			return nil, err
		}
		subs = append(subs, s)
	}
	return subs, rows.Err()
}

// DeletePushSubscriptionByEndpoint removes a subscription regardless of
// owner — used only for server-driven cleanup (the push service itself
// reported the endpoint gone, 404/410; there is no per-user authorization
// concern in that path, it's system maintenance). HTTP-triggered unsubscribe
// must go through DeletePushSubscriptionForUser instead.
func DeletePushSubscriptionByEndpoint(d *DB, endpoint string) error {
	_, err := d.Exec(`DELETE FROM push_subscriptions WHERE endpoint=?`, endpoint)
	return err
}

// DeletePushSubscriptionForUser removes a subscription only if it belongs to
// userID — used by the explicit unsubscribe endpoint, so one authenticated
// user can't remove another's subscription by guessing/reusing an endpoint
// string.
func DeletePushSubscriptionForUser(d *DB, userID int64, endpoint string) error {
	_, err := d.Exec(`DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?`, userID, endpoint)
	return err
}
