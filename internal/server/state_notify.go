package server

import (
	"fmt"

	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/stateclass"
)

// resolveStateNotifyRecipients resolve os destinatários de uma transição de
// estado: somente se o classificador tem `NotifyEnabled`, e apenas os usuários
// do canal notify (interseção com acesso à câmera; admin sempre tem). Recarrega
// a config do banco para refletir edições de destinatários sem exigir restart
// (o runner passa o snapshot do boot). Fallback: o c recebido.
func resolveStateNotifyRecipients(database *db.DB, c stateclass.Classifier) (stateclass.Classifier, []int64, error) {
	if fresh, err := db.GetStateClassifier(database, c.ID); err == nil {
		c = fresh
	}
	if !c.NotifyEnabled {
		return c, nil, nil
	}
	recipients := make(map[int64]bool, len(c.NotifyUserIDs))
	for _, uid := range c.NotifyUserIDs {
		recipients[uid] = true
	}
	if len(recipients) == 0 {
		return c, nil, nil
	}
	users, err := db.ListUsers(database)
	if err != nil {
		return c, nil, err
	}
	var out []int64
	for _, u := range users {
		if !recipients[u.ID] {
			continue
		}
		if u.Role != "admin" {
			cams, err := db.GetUserCameras(database, u.ID)
			if err != nil || !sliceContains(cams, c.CameraID) {
				continue
			}
		}
		out = append(out, u.ID)
	}
	return c, out, nil
}

func sliceContains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

// PublishClassifierState é chamada pelo `emit` do runner na transição de estado:
// notifica os usuários com acesso. O estado em si já foi persistido pelo Runner.
func (s *Server) PublishClassifierState(c stateclass.Classifier, state string, confidence float64) {
	if s.db == nil {
		return
	}
	c, recipients, err := resolveStateNotifyRecipients(s.db, c)
	if err != nil {
		if s.log != nil {
			s.log.Warn("state notification failed", "classifier", c.ID, "err", err)
		}
		return
	}
	if len(recipients) == 0 || s.notifications == nil {
		return
	}
	s.notifications.Notify(notifications.Notification{
		UserIDs: recipients,
		Type:    "info",
		Title:   c.Name,
		Message: fmt.Sprintf("Estado: %s", state),
		Link:    "/settings/states/" + c.CameraID,
	})
}
