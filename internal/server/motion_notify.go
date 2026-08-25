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

// NotifyCameraMotion dispatches to whichever of the two DEDICATED motion
// channels are wired (Telegram, Web Push) — never the shared Dispatcher
// (s.notifications), which fans out to every registered sender including
// the always-on in-app bell (see telegramSender's doc comment in server.go
// for why). Called from cmd/camera/main.go's onMotionEvent AFTER it has
// already confirmed (via db.FindRecordingCoveringMotion) that a recording
// backs this event — same "só notifica quando tem gravação" gate as the SSE
// motion bell and the Momentos badge (feat/badge-momento-sem-gravacao).
//
// The two channels resolve recipients differently and fail independently
// (one channel's error/absence never blocks the other, same "erro de um
// sender não impede os demais" philosophy as notifications.Dispatcher):
// Telegram requires an explicit per-camera opt-in
// (db.ListCameraMotionTelegramNotifyPrefs, with a minimum score); Web Push
// has no such preference table yet — the browser notification permission
// (granted when the user subscribes) IS the opt-in, so every user with
// access to the camera (admin, or a viewer with an explicit grant) is a
// candidate recipient.
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
	if s.db == nil {
		return
	}

	var telegramRecipients, webpushRecipients []int64
	if s.telegramSender != nil {
		var err error
		telegramRecipients, err = s.telegramMotionRecipients(cameraID, score)
		if err != nil && s.log != nil {
			s.log.Warn("motion notification (telegram) failed", "camera", cameraID, "err", err)
		}
	}
	if s.webpushSender != nil {
		var err error
		webpushRecipients, err = s.webpushMotionRecipients(cameraID)
		if err != nil && s.log != nil {
			s.log.Warn("motion notification (webpush) failed", "camera", cameraID, "err", err)
		}
	}
	if len(telegramRecipients) == 0 && len(webpushRecipients) == 0 {
		return
	}

	loc, err := time.LoadLocation(s.timezone)
	if err != nil {
		loc = time.UTC
	}
	when := occurredAt.In(loc).Format("02/01/2006 15:04:05")
	camera := s.cameraName(cameraID)
	link := fmt.Sprintf("/recording/%s/%d/%d", cameraID, recordingID, motionEventID)

	var imagePath string
	if framePath != "" {
		imagePath = filepath.Join(s.cfg.RecordingsPath, cameraID, occurredAt.UTC().Format("2006/01/02"), framePath)
	}

	for _, uid := range telegramRecipients {
		n := notifications.Notification{
			UserIDs: []int64{uid}, Type: "info", Title: "Movimento detectado",
			Message: telegramMotionMessage(when, camera, score, s.cfg.PublicURL, link), Link: link, ImagePath: imagePath,
		}
		if err := s.telegramSender.Send(n, uid); err != nil && s.log != nil {
			s.log.Warn("motion telegram notification failed", "camera", cameraID, "user_id", uid, "error", err)
		}
	}
	for _, uid := range webpushRecipients {
		n := notifications.Notification{
			UserIDs: []int64{uid}, Type: "info", Title: "Movimento detectado",
			// Web Push body is plain text (shown verbatim in the OS
			// notification popup) — unlike Telegram's Message, no HTML markup.
			Message: fmt.Sprintf("%s · %s · %.1f%%", camera, when, score*100), Link: link, ImagePath: imagePath,
		}
		if err := s.webpushSender.Send(n, uid); err != nil && s.log != nil {
			s.log.Warn("motion webpush notification failed", "camera", cameraID, "user_id", uid, "error", err)
		}
	}
}

// telegramMotionMessage builds the HTML-formatted (parse_mode=HTML) message
// body Telegram expects — a link to the exact clip is appended only when
// PublicURL is configured (a relative path wouldn't resolve to anything
// meaningful from inside the Telegram app).
func telegramMotionMessage(when, camera string, score float64, publicURL, link string) string {
	message := fmt.Sprintf("📹 <b>Movimento detectado</b>\n🕐 %s\n📍 %s\n📊 Score: %.3f",
		when, htmlpkg.EscapeString(camera), score)
	if publicURL != "" {
		full := strings.TrimRight(publicURL, "/") + link
		message += fmt.Sprintf("\n<a href=\"%s\">Ver gravação</a>", htmlpkg.EscapeString(full))
	}
	return message
}

// telegramMotionRecipients resolves which users opted in to Telegram motion
// notifications for cameraID (with a score requirement they configured
// themselves).
func (s *Server) telegramMotionRecipients(cameraID string, score float64) ([]int64, error) {
	prefs, err := db.ListCameraMotionTelegramNotifyPrefs(s.db, cameraID)
	if err != nil {
		return nil, err
	}
	var recipients []int64
	for _, p := range prefs {
		if p.Enabled && score >= p.MinScore {
			recipients = append(recipients, p.UserID)
		}
	}
	return recipients, nil
}

// webpushMotionRecipients resolves every user who can access cameraID
// (admin, or a viewer with an explicit grant) — Web Push has no per-camera
// preference table yet; subscribing to push at all (granting the browser
// notification permission) is the opt-in.
func (s *Server) webpushMotionRecipients(cameraID string) ([]int64, error) {
	users, err := db.ListUsers(s.db)
	if err != nil {
		return nil, err
	}
	var recipients []int64
	for _, u := range users {
		if u.Role == "admin" {
			recipients = append(recipients, u.ID)
			continue
		}
		ok, err := db.UserHasCamera(s.db, u.ID, cameraID)
		if err != nil {
			return nil, err
		}
		if ok {
			recipients = append(recipients, u.ID)
		}
	}
	return recipients, nil
}
