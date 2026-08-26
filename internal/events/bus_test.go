package events_test

import (
	"testing"
	"time"

	"camera/internal/events"
)

func TestBus(t *testing.T) {
	t.Run("CA2: publish sem assinante não bloqueia", func(t *testing.T) {
		b := events.NewBus()
		done := make(chan struct{})
		go func() {
			b.Publish(events.Event{Type: "recorder.stopped", CameraID: "cam1"})
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatal("Publish bloqueou sem nenhum assinante")
		}
	})

	t.Run("CA2: assinante recebe evento do tipo inscrito", func(t *testing.T) {
		b := events.NewBus()
		ch, unsubscribe := b.Subscribe("recorder.stopped")
		defer unsubscribe()

		want := events.Event{Type: "recorder.stopped", CameraID: "cam1", At: time.Now()}
		b.Publish(want)

		select {
		case got := <-ch:
			if got.Type != want.Type || got.CameraID != want.CameraID {
				t.Errorf("got %+v, want %+v", got, want)
			}
		case <-time.After(time.Second):
			t.Fatal("assinante não recebeu o evento publicado")
		}
	})

	t.Run("CA2: assinante não recebe evento de outro tipo", func(t *testing.T) {
		b := events.NewBus()
		ch, unsubscribe := b.Subscribe("recorder.stopped")
		defer unsubscribe()

		b.Publish(events.Event{Type: "transmission.stopped", CameraID: "cam1"})

		select {
		case got := <-ch:
			t.Fatalf("assinante de recorder.stopped recebeu evento de outro tipo: %+v", got)
		case <-time.After(100 * time.Millisecond):
		}
	})

	t.Run("CA2: publish em canal cheio descarta em vez de bloquear", func(t *testing.T) {
		b := events.NewBus()
		_, unsubscribe := b.Subscribe("recorder.stopped") // nunca drenado de propósito
		defer unsubscribe()

		done := make(chan struct{})
		go func() {
			// bem mais que a capacidade do canal — nenhuma dessas chamadas
			// pode bloquear esperando o assinante ler.
			for i := 0; i < 100; i++ {
				b.Publish(events.Event{Type: "recorder.stopped", CameraID: "cam1"})
			}
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatal("Publish bloqueou com o canal do assinante cheio")
		}
	})

	t.Run("CA2: unsubscribe para de receber", func(t *testing.T) {
		b := events.NewBus()
		ch, unsubscribe := b.Subscribe("recorder.stopped")
		unsubscribe()

		b.Publish(events.Event{Type: "recorder.stopped", CameraID: "cam1"})

		select {
		case got, ok := <-ch:
			if ok {
				t.Fatalf("assinante desinscrito recebeu evento: %+v", got)
			}
		case <-time.After(100 * time.Millisecond):
		}
	})
}
