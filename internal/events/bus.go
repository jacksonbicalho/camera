// Package events é um barramento de eventos in-process: qualquer parte do
// backend publica um Event tipado sem conhecer os assinantes; quem quiser
// reage se inscreve pelo Type. Só em memória — sem broker externo, sem
// persistência (evento publicado sem assinante se perde, aceitável pro caso
// de uso: alertas operacionais em tempo real, não um log de auditoria).
package events

import (
	"sync"
	"time"
)

// Event é o payload publicado no bus. Data é opaco ao bus — cada produtor
// define seu próprio formato, e cada assinante que se importa com o
// conteúdo faz o type assert.
type Event struct {
	Type     string
	CameraID string
	At       time.Time
	Data     any
}

// subscriberBufferSize casa com server/notifHub — grande o bastante pra
// absorver uma rajada sem descartar, pequeno o bastante pra não esconder um
// assinante que parou de ler.
const subscriberBufferSize = 16

// Bus faz fan-out de Event por Type. Zero value não é utilizável — use
// NewBus.
type Bus struct {
	mu   sync.Mutex
	subs map[string]map[chan Event]struct{}
}

func NewBus() *Bus {
	return &Bus{subs: make(map[string]map[chan Event]struct{})}
}

// Publish entrega e a todo assinante do mesmo Type. Não-bloqueante: um
// assinante com o canal cheio (não está lendo) simplesmente perde o evento,
// em vez de travar o produtor.
func (b *Bus) Publish(e Event) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.subs[e.Type] {
		select {
		case ch <- e:
		default:
		}
	}
}

// Subscribe registra interesse em eventType e devolve o canal de leitura
// junto com uma função unsubscribe — chamá-la fecha o canal e remove o
// assinante; publicações concorrentes em andamento continuam seguras (o
// unsubscribe só remove do mapa sob o mesmo lock que Publish usa pra
// iterar).
func (b *Bus) Subscribe(eventType string) (<-chan Event, func()) {
	ch := make(chan Event, subscriberBufferSize)

	b.mu.Lock()
	if b.subs[eventType] == nil {
		b.subs[eventType] = make(map[chan Event]struct{})
	}
	b.subs[eventType][ch] = struct{}{}
	b.mu.Unlock()

	unsubscribe := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		m := b.subs[eventType]
		if m == nil {
			return
		}
		if _, ok := m[ch]; !ok {
			return
		}
		delete(m, ch)
		close(ch)
		if len(m) == 0 {
			delete(b.subs, eventType)
		}
	}
	return ch, unsubscribe
}
