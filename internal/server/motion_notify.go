package server

import (
	"fmt"

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
// themselves) and dispatches to them. Called from cmd/camera/main.go's
// onMotionEvent right after a motion event is persisted — mirrors
// resolveStateNotifyRecipients/PublishClassifierState (state_notify.go).
func (s *Server) NotifyCameraMotion(cameraID string, score float64) {
	if s.db == nil || s.notifications == nil {
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
	s.notifications.Notify(notifications.Notification{
		UserIDs: recipients,
		Type:    "info",
		Title:   "Movimento detectado",
		Message: fmt.Sprintf("Movimento detectado na câmera %s (score %.3f)", s.cameraName(cameraID), score),
		Link:    "/history/" + cameraID,
	})
}
