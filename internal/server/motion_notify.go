package server

import (
	"fmt"
	htmlpkg "html"
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
// cmd/camera/main.go's onMotionEvent AFTER it has already confirmed (via
// db.FindRecordingCoveringMotion) that a recording backs this event — same
// "só notifica quando tem gravação" gate as the SSE motion bell and the
// Momentos badge (feat/badge-momento-sem-gravacao).
//
// occurredAt is the event's UTC timestamp (used both for the message's local
// date/time and to resolve framePath's directory); framePath is the bare
// snapshot filename produced by internal/motion (empty when no snapshot
// exists) — resolved here into an absolute path under s.cfg.RecordingsPath,
// same layout as event_label.go/finetune.go. recordingID/motionEventID
// identify the specific recording/event the caller already resolved, used
// to build a link straight to that clip (/recording/:cameraId/:recordingId/
// :motionId) instead of just the camera's history page.
func (s *Server) NotifyCameraMotion(cameraID string, occurredAt time.Time, score float64, framePath string, recordingID, motionEventID int64) {
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
	message := fmt.Sprintf("📹 <b>Movimento detectado</b>\n🕐 %s\n📍 %s\n📊 Score: %.3f",
		occurredAt.In(loc).Format("02/01/2006 15:04:05"), htmlpkg.EscapeString(s.cameraName(cameraID)), score)
	if s.cfg.PublicURL != "" {
		link := fmt.Sprintf("%s/recording/%s/%d/%d", strings.TrimRight(s.cfg.PublicURL, "/"), cameraID, recordingID, motionEventID)
		message += fmt.Sprintf("\n<a href=\"%s\">Ver gravação</a>", htmlpkg.EscapeString(link))
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
		Link:      fmt.Sprintf("/recording/%s/%d/%d", cameraID, recordingID, motionEventID),
		ImagePath: imagePath,
	}
	for _, uid := range recipients {
		if err := s.telegramSender.Send(n, uid); err != nil && s.log != nil {
			s.log.Warn("motion telegram notification failed", "camera", cameraID, "user_id", uid, "error", err)
		}
	}
}
