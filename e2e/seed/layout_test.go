package main

import (
	"testing"
	"time"
)

func TestChunkLayout(t *testing.T) {
	// Meio-dia UTC: janela ampla, N cabe com espaçamento > 1s.
	now := time.Date(2026, 7, 3, 12, 0, 0, 0, time.UTC)
	startOfDay := time.Date(2026, 7, 3, 0, 0, 0, 0, time.UTC)
	latest := now.Add(-5 * time.Minute)

	cases := []int{8, 1500, 3000}
	for _, req := range cases {
		n, base, spacing := chunkLayout(req, now)
		if n < 1 {
			t.Fatalf("req=%d: n=%d < 1", req, n)
		}
		if n > req {
			t.Fatalf("req=%d: n=%d > requested", req, n)
		}
		if spacing < time.Second {
			t.Fatalf("req=%d: spacing %v < 1s (segundos não distintos)", req, spacing)
		}
		if spacing > 30*time.Second {
			t.Fatalf("req=%d: spacing %v > 30s (não fundiria num run)", req, spacing)
		}
		if base.Before(startOfDay) {
			t.Fatalf("req=%d: base %v antes de startOfDay", req, base)
		}
		last := base.Add(time.Duration(n-1) * spacing)
		if !last.Before(latest.Add(time.Second)) {
			t.Fatalf("req=%d: último chunk %v não está no passado (latest=%v)", req, last, latest)
		}
		// Todos no mesmo dia (hoje).
		if base.Format("2006-01-02") != "2026-07-03" || last.Format("2006-01-02") != "2026-07-03" {
			t.Fatalf("req=%d: chunks fora de hoje (base=%v last=%v)", req, base, last)
		}
	}
}

func TestChunkLayoutEarlyDayReducesN(t *testing.T) {
	// 00:10 UTC: janela decorrida = 5 min = 300s (latest = 00:05). Pedir 1000 chunks
	// deve reduzir n para caber em segundos distintos (≤ 300).
	now := time.Date(2026, 7, 3, 0, 10, 0, 0, time.UTC)
	n, _, spacing := chunkLayout(1000, now)
	if n > 300 {
		t.Fatalf("n=%d deveria ser reduzido a ≤300 na janela de 300s", n)
	}
	if spacing < time.Second {
		t.Fatalf("spacing %v < 1s", spacing)
	}
}
