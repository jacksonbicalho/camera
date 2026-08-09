package server

import (
	"fmt"

	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/release"
)

// NotifyUpdateAvailable notifica todos os admins de que há uma nova versão —
// no máximo uma vez por versão latest (dedup em memória). É um no-op quando
// não há update disponível, sem banco, ou quando a versão já foi notificada.
// Pensado para ser ligado ao Checker via OnCheck.
func (s *Server) NotifyUpdateAvailable(st release.Status) {
	if s.db == nil || !st.UpdateAvailable || st.Latest == "" {
		return
	}

	s.updateNotifyMu.Lock()
	if st.Latest == s.updateNotified {
		s.updateNotifyMu.Unlock()
		return
	}
	s.updateNotified = st.Latest
	s.updateNotifyMu.Unlock()

	users, err := db.ListUsers(s.db)
	if err != nil {
		s.log.Warn("notify update: list users failed", "error", err)
		return
	}

	var adminIDs []int64
	for _, u := range users {
		if u.Role == "admin" {
			adminIDs = append(adminIDs, u.ID)
		}
	}
	if len(adminIDs) == 0 || s.notifications == nil {
		return
	}
	s.notifications.Notify(notifications.Notification{
		UserIDs: adminIDs,
		Type:    "info",
		Title:   "Atualização disponível",
		Message: fmt.Sprintf("Nova versão %s disponível.", st.Latest),
		Link:    "/settings/about",
	})
}
