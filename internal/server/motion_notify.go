package server

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"camera/internal/db"
	"camera/internal/notifications"
)

// cameraName resolves cameraID to its configured display name, falling back
// to the id itself when not found (mirrors cameraSnapshotSource's lookup).
func (s *Server) cameraName(cameraID string) string {
	for _, c := range s.cameras {
		if c.ID == cameraID {
			if c.Name != "" {
				return c.Name
			}
			return c.ID
		}
	}
	return cameraID
}

// NotifyCameraMotion resolves which users opted in to Telegram motion
// notifications for cameraID (with a score requirement they configured
// themselves) and dispatches to them via the DEDICATED Telegram channel
// (s.telegramSender) — never the shared Dispatcher (s.notifications), which
// fans out to every registered sender including the always-on in-app bell
// (see telegramSender's doc comment in server.go for why). Called from
// cmd/camera/main.go's onMotionEvent right after a motion event is
// persisted — recipient resolution mirrors resolveStateNotifyRecipients/
// PublishClassifierState (state_notify.go).
//
// occurredAt is the event's UTC timestamp (used both for the message's local
// date/time and to resolve framePath's directory); framePath is the bare
// snapshot filename produced by internal/motion (empty when no snapshot
// exists) — resolved here into an absolute path under s.cfg.RecordingsPath,
// same layout as event_label.go/finetune.go.
func (s *Server) NotifyCameraMotion(cameraID string, occurredAt time.Time, score float64, framePath string) {
	if s.db == nil || s.telegramSender == nil {
		return
	}
	prefs, err := db.ListCameraMotionTelegramNotifyPrefs(s.db, cameraID)
	if err != nil {
		if s.log != nil {
			s.log.Warn("motion notification failed", "camera", cameraID, "err", err)
		}
		return
	}
	var recipients []int64
	for _, p := range prefs {
		if p.Enabled && score >= p.MinScore {
			recipients = append(recipients, p.UserID)
		}
	}
	if len(recipients) == 0 {
		return
	}

	loc, err := time.LoadLocation(s.timezone)
	if err != nil {
		loc = time.UTC
	}
	message := fmt.Sprintf("📹 Movimento detectado\n🕐 %s\n📍 %s\n📊 Score: %.3f",
		occurredAt.In(loc).Format("02/01/2006 15:04:05"), s.cameraName(cameraID), score)
	if s.cfg.PublicURL != "" {
		message += "\n" + strings.TrimRight(s.cfg.PublicURL, "/") + "/history/" + cameraID
	}

	var imagePath string
	if framePath != "" {
		imagePath = filepath.Join(s.cfg.RecordingsPath, cameraID, occurredAt.UTC().Format("2006/01/02"), framePath)
	}

	n := notifications.Notification{
		UserIDs:   recipients,
		Type:      "info",
		Title:     "Movimento detectado",
		Message:   message,
		Link:      "/history/" + cameraID,
		ImagePath: imagePath,
	}
	for _, uid := range recipients {
		if err := s.telegramSender.Send(n, uid); err != nil && s.log != nil {
			s.log.Warn("motion telegram notification failed", "camera", cameraID, "user_id", uid, "error", err)
		}
	}
}
