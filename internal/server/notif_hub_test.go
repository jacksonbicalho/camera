package server

import (
	"testing"
	"time"
)

func TestNotifHub_FanoutAndIsolation(t *testing.T) {
	h := newNotifHub()
	a := h.subscribe(1)
	b := h.subscribe(2)

	h.publish(1, notifEvent{Type: "notification"})

	select {
	case ev := <-a:
		if ev.Type != "notification" {
			t.Fatalf("evento inesperado: %+v", ev)
		}
	case <-time.After(time.Second):
		t.Fatal("subscriber do user 1 não recebeu o publish")
	}

	select {
	case <-b:
		t.Fatal("subscriber do user 2 recebeu evento destinado ao user 1 (vazamento)")
	case <-time.After(50 * time.Millisecond):
		// ok: isolado por usuário
	}
}

func TestNotifHub_Unsubscribe(t *testing.T) {
	h := newNotifHub()
	ch := h.subscribe(1)
	h.unsubscribe(1, ch)
	h.publish(1, notifEvent{Type: "notification"})

	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("recebeu evento após unsubscribe")
		}
	case <-time.After(50 * time.Millisecond):
		// ok: nada recebido
	}
}

func TestNotifHub_PublishNonBlockingWhenFull(t *testing.T) {
	h := newNotifHub()
	_ = h.subscribe(1) // canal nunca é drenado

	done := make(chan struct{})
	go func() {
		for i := 0; i < 100; i++ {
			h.publish(1, notifEvent{Type: "notification"})
		}
		close(done)
	}()

	select {
	case <-done:
		// ok: publish não bloqueou apesar do canal cheio
	case <-time.After(time.Second):
		t.Fatal("publish bloqueou com o canal do subscriber cheio")
	}
}
