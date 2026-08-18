package main

import (
	"testing"
	"time"
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
