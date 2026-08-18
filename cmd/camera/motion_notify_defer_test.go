package main

import (
	"testing"
	"time"

	"camera/internal/db"
)

func TestAwaitRecordingCoverage(t *testing.T) {
	t.Run("CA2: confirma cobertura assim que check() retorna true, sem esperar o teto", func(t *testing.T) {
		tick := make(chan time.Time, 10)
		for i := 0; i < 10; i++ {
			tick <- time.Time{}
		}
		calls := 0
		check := func() bool {
			calls++
			return calls == 3
		}
		got := awaitRecordingCoverage(check, tick, 10)
		if !got {
			t.Fatal("esperava true (cobertura confirmada)")
		}
		if calls != 3 {
			t.Errorf("esperava parar no 3º tick, check() foi chamado %d vezes", calls)
		}
	})

	t.Run("CA3: desiste (retorna false) se check() nunca confirma até o teto de tentativas", func(t *testing.T) {
		tick := make(chan time.Time, 5)
		for i := 0; i < 5; i++ {
			tick <- time.Time{}
		}
		calls := 0
		check := func() bool {
			calls++
			return false
		}
		got := awaitRecordingCoverage(check, tick, 5)
		if got {
			t.Fatal("esperava false (nunca confirmou)")
		}
		if calls != 5 {
			t.Errorf("esperava exatamente 5 chamadas (o teto), got %d", calls)
		}
	})
}

func TestDeferredNotifyMotion(t *testing.T) {
	t.Run("CA4: chama notify com a Recording confirmada (fechada) quando a cobertura resolve dentro do teto", func(t *testing.T) {
		tick := make(chan time.Time, 10)
		for i := 0; i < 10; i++ {
			tick <- time.Time{}
		}
		open := db.Recording{ID: 1, Path: "a.mp4"}
		closed := db.Recording{ID: 1, Path: "a.mp4", EndedAt: time.Date(2026, 6, 23, 12, 0, 40, 0, time.UTC)}
		call := 0
		findCovering := func() (db.Recording, bool) {
			call++
			if call < 3 {
				return open, true
			}
			return closed, true
		}
		var notified *db.Recording
		notify := func(r db.Recording) { notified = &r }

		deferredNotifyMotion(findCovering, tick, 10, notify)

		if notified == nil {
			t.Fatal("esperava notify() chamado, não foi chamado")
		}
		if notified.EndedAt.IsZero() {
			t.Errorf("esperava notify() com a Recording FECHADA, got EndedAt zero: %+v", notified)
		}
	})

	t.Run("CA5: nunca chama notify quando o teto esgota sem findCovering confirmar uma linha fechada", func(t *testing.T) {
		tick := make(chan time.Time, 4)
		for i := 0; i < 4; i++ {
			tick <- time.Time{}
		}
		open := db.Recording{ID: 1, Path: "a.mp4"}
		findCovering := func() (db.Recording, bool) { return open, true }
		notified := false
		notify := func(db.Recording) { notified = true }

		deferredNotifyMotion(findCovering, tick, 4, notify)

		if notified {
			t.Error("notify() não deveria ter sido chamado — cobertura nunca fechou dentro do teto")
		}
	})

	t.Run("CA5: nunca chama notify quando findCovering para de achar cobertura nenhuma (ok=false)", func(t *testing.T) {
		tick := make(chan time.Time, 3)
		for i := 0; i < 3; i++ {
			tick <- time.Time{}
		}
		findCovering := func() (db.Recording, bool) { return db.Recording{}, false }
		notified := false
		notify := func(db.Recording) { notified = true }

		deferredNotifyMotion(findCovering, tick, 3, notify)

		if notified {
			t.Error("notify() não deveria ter sido chamado — nenhuma cobertura encontrada")
		}
	})
}
