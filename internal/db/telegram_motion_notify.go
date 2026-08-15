package db

import (
	"encoding/json"
	"fmt"
)

// telegramMotionNotifyKeyPrefix mirrors the notify:email_enabled/telegram_chat_id
// idiom in theme.go/telegram.go: per-user Telegram motion-notify opt-in reuses
// the generic user_settings KV table, with the camera_id embedded in the key
// (no camera dimension exists in user_settings) — no dedicated migration.
const telegramMotionNotifyKeyPrefix = "notify:telegram:motion:"

func telegramMotionNotifyKey(cameraID string) string {
	return telegramMotionNotifyKeyPrefix + cameraID
}

type telegramMotionNotifyValue struct {
	Enabled  bool    `json:"enabled"`
	MinScore float64 `json:"min_score"`
}

// GetUserCameraMotionTelegramNotify returns whether userID opted in to
// receive Telegram motion notifications for cameraID, and the minimum score
// they configured. Default (never configured): enabled=false, minScore=0.
func GetUserCameraMotionTelegramNotify(db *DB, userID int64, cameraID string) (enabled bool, minScore float64, err error) {
	raw, err := getUserSetting(db, userID, telegramMotionNotifyKey(cameraID), "")
	if err != nil {
		return false, 0, err
	}
	if raw == "" {
		return false, 0, nil
	}
	var v telegramMotionNotifyValue
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		return false, 0, fmt.Errorf("unmarshal telegram motion notify pref: %w", err)
	}
	return v.Enabled, v.MinScore, nil
}

// SetUserCameraMotionTelegramNotify persists userID's Telegram motion-notify
// opt-in and minimum score for cameraID.
func SetUserCameraMotionTelegramNotify(db *DB, userID int64, cameraID string, enabled bool, minScore float64) error {
	raw, err := json.Marshal(telegramMotionNotifyValue{Enabled: enabled, MinScore: minScore})
	if err != nil {
		return fmt.Errorf("marshal telegram motion notify pref: %w", err)
	}
	return setUserSetting(db, userID, telegramMotionNotifyKey(cameraID), string(raw))
}

// CameraMotionTelegramNotifyPref is one user's Telegram motion-notify
// opt-in for a single camera, as returned by ListCameraMotionTelegramNotifyPrefs.
type CameraMotionTelegramNotifyPref struct {
	UserID   int64
	Enabled  bool
	MinScore float64
}

// ListCameraMotionTelegramNotifyPrefs returns every user's Telegram
// motion-notify opt-in configured for cameraID (regardless of Enabled) —
// used to resolve notification recipients when a motion event fires.
func ListCameraMotionTelegramNotifyPrefs(db *DB, cameraID string) ([]CameraMotionTelegramNotifyPref, error) {
	key := telegramMotionNotifyKey(cameraID)
	rows, err := db.Query(`SELECT user_id, value FROM user_settings WHERE key=?`, key)
	if err != nil {
		return nil, fmt.Errorf("list camera motion telegram notify prefs: %w", err)
	}
	defer rows.Close()

	var prefs []CameraMotionTelegramNotifyPref
	for rows.Next() {
		var userID int64
		var raw string
		if err := rows.Scan(&userID, &raw); err != nil {
			return nil, err
		}
		var v telegramMotionNotifyValue
		if err := json.Unmarshal([]byte(raw), &v); err != nil {
			return nil, fmt.Errorf("unmarshal telegram motion notify pref for user %d: %w", userID, err)
		}
		prefs = append(prefs, CameraMotionTelegramNotifyPref{UserID: userID, Enabled: v.Enabled, MinScore: v.MinScore})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return prefs, nil
}
