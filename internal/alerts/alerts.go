// Package alerts é o único assinante dos eventos operacionais publicados em
// internal/events (recorder/transmissão parados ou recuperados) — traduz
// cada um numa notifications.Notification entregue a todo usuário admin via
// notifications.Dispatcher, reaproveitando 100% do Dispatcher existente
// (antes só storage/cleaner.go e server/update_notify.go chamavam Notify
// direto, cada um resolvendo "quem avisar" com sua própria lógica).
package alerts

import (
	"context"
	"fmt"
	"log/slog"

	"camera/internal/db"
	"camera/internal/events"
	"camera/internal/notifications"
	"camera/internal/recorder"
	"camera/internal/server"
	"camera/internal/transmission/hls"
)

type alertSpec struct {
	notifType string
	title     string
	message   func(cameraID string) string
}

var specs = map[string]alertSpec{
	recorder.EventStopped: {
		notifType: "warning",
		title:     "Gravação interrompida",
		message: func(cameraID string) string {
			return fmt.Sprintf("A câmera %s parou de gravar inesperadamente.", cameraID)
		},
	},
	recorder.EventRecovered: {
		notifType: "success",
		title:     "Gravação recuperada",
		message: func(cameraID string) string {
			return fmt.Sprintf("A câmera %s voltou a gravar.", cameraID)
		},
	},
	hls.EventStopped: {
		notifType: "warning",
		title:     "Transmissão interrompida",
		message: func(cameraID string) string {
			return fmt.Sprintf("A transmissão ao vivo da câmera %s parou inesperadamente.", cameraID)
		},
	},
	hls.EventRecovered: {
		notifType: "success",
		title:     "Transmissão recuperada",
		message: func(cameraID string) string {
			return fmt.Sprintf("A transmissão ao vivo da câmera %s voltou.", cameraID)
		},
	},
	server.EventUpdateApplied: {
		notifType: "success",
		title:     "Atualização aplicada",
		message: func(_ string) string {
			return "O sistema foi atualizado e reiniciado com sucesso."
		},
	},
	server.EventUpdateFailed: {
		notifType: "warning",
		title:     "Falha ao atualizar",
		message: func(_ string) string {
			return "Não foi possível aplicar a atualização. Veja os logs do servidor para mais detalhes."
		},
	},
}

// Subscribe assina os 4 tipos de evento operacional em bus e devolve o
// controle imediatamente — cada assinatura roda numa goroutine própria até
// ctx ser cancelado (quando se desinscreve e retorna).
func Subscribe(ctx context.Context, bus *events.Bus, database *db.DB, dispatcher *notifications.Dispatcher, log *slog.Logger) {
	for eventType, spec := range specs {
		ch, unsubscribe := bus.Subscribe(eventType)
		go run(ctx, ch, unsubscribe, spec, database, dispatcher, log)
	}
}

func run(ctx context.Context, ch <-chan events.Event, unsubscribe func(), spec alertSpec, database *db.DB, dispatcher *notifications.Dispatcher, log *slog.Logger) {
	defer unsubscribe()
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			notifyAdmins(database, dispatcher, spec, ev, log)
		}
	}
}

func notifyAdmins(database *db.DB, dispatcher *notifications.Dispatcher, spec alertSpec, ev events.Event, log *slog.Logger) {
	users, err := db.ListUsers(database)
	if err != nil {
		if log != nil {
			log.Warn("alerts: failed to list users", "error", err)
		}
		return
	}
	var adminIDs []int64
	for _, u := range users {
		if u.Role == "admin" {
			adminIDs = append(adminIDs, u.ID)
		}
	}
	if len(adminIDs) == 0 {
		return
	}
	dispatcher.Notify(notifications.Notification{
		UserIDs: adminIDs,
		Type:    spec.notifType,
		Title:   spec.title,
		Message: spec.message(ev.CameraID),
	})
}
