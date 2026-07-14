package main

import (
	"testing"
	"time"
)

func TestRecordingSlots_ContiguousAndBeforeNow(t *testing.T) {
	now := time.Date(2026, 7, 14, 12, 0, 0, 0, time.UTC)
	spacing := 2 * time.Minute

	slots := recordingSlots(5, now, spacing)
	if len(slots) != 5 {
		t.Fatalf("expected 5 slots, got %d", len(slots))
	}
	for i, s := range slots {
		if !s.End.After(s.Start) {
			t.Fatalf("slot %d: end %v not after start %v", i, s.End, s.Start)
		}
		if s.End.Sub(s.Start) != spacing {
			t.Fatalf("slot %d: expected spacing %v, got %v", i, spacing, s.End.Sub(s.Start))
		}
		if !s.End.Before(now) {
			t.Fatalf("slot %d: end %v not before now %v (recording would look in-progress)", i, s.End, now)
		}
		if i > 0 && !s.Start.Equal(slots[i-1].End) {
			t.Fatalf("slot %d: start %v is not contiguous with previous end %v", i, s.Start, slots[i-1].End)
		}
	}
}

func TestRecordingSlots_ClampedToCalendarDay(t *testing.T) {
	now := time.Date(2026, 7, 14, 0, 3, 0, 0, time.UTC) // 00:03 UTC — pouco depois da meia-noite
	spacing := 2 * time.Minute

	slots := recordingSlots(50, now, spacing) // mais do que cabe antes de "now"
	midnight := time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC)

	if !slots[0].Start.Equal(midnight) {
		t.Fatalf("expected schedule clamped to midnight %v, got start %v", midnight, slots[0].Start)
	}
	for i := 1; i < len(slots); i++ {
		if !slots[i].Start.Equal(slots[i-1].End) {
			t.Fatalf("slot %d not contiguous after clamp", i)
		}
	}
}

func TestRecordingSlots_ZeroOrNegative(t *testing.T) {
	now := time.Now()
	if s := recordingSlots(0, now, time.Minute); s != nil {
		t.Fatalf("expected nil for n=0, got %v", s)
	}
	if s := recordingSlots(-1, now, time.Minute); s != nil {
		t.Fatalf("expected nil for n=-1, got %v", s)
	}
}
