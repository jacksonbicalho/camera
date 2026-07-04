package server

import "sync"

// notifEvent é o payload empurrado pelo SSE de notificações. É um sinal mínimo:
// o front recarrega GET /api/notifications ao recebê-lo (a lista/unread_count
// continuam vindo do handler único, sem duplicar serialização aqui).
type notifEvent struct {
	Type string `json:"type"`
}

// notifHub é o fan-out de notificações por usuário (espelha o broadcaster do
// motion, mas keyed por user_id): cada conexão SSE assina o próprio user_id e
// recebe só os eventos publicados para ele. Não-bloqueante: publish descarta em
// canal cheio, como o broadcaster.
type notifHub struct {
	mu   sync.Mutex
	subs map[int64]map[chan notifEvent]struct{}
}

func newNotifHub() *notifHub {
	return &notifHub{subs: make(map[int64]map[chan notifEvent]struct{})}
}

func (h *notifHub) subscribe(userID int64) chan notifEvent {
	ch := make(chan notifEvent, 16)
	h.mu.Lock()
	if h.subs[userID] == nil {
		h.subs[userID] = make(map[chan notifEvent]struct{})
	}
	h.subs[userID][ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *notifHub) unsubscribe(userID int64, ch chan notifEvent) {
	h.mu.Lock()
	if m := h.subs[userID]; m != nil {
		delete(m, ch)
		if len(m) == 0 {
			delete(h.subs, userID)
		}
	}
	h.mu.Unlock()
}

func (h *notifHub) publish(userID int64, ev notifEvent) {
	h.mu.Lock()
	for ch := range h.subs[userID] {
		select {
		case ch <- ev:
		default:
		}
	}
	h.mu.Unlock()
}
