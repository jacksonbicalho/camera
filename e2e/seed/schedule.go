package main

import "time"

// recordingSlot is one contiguous, non-overlapping time window seeded as a
// recording.
type recordingSlot struct {
	Start time.Time
	End   time.Time
}

// recordingSlots lays out n contiguous slots of the given spacing, ending a
// few minutes before now (so the last one never looks "in progress"). The
// whole schedule is clamped to now's UTC calendar day: if n*spacing would
// push the start before that day's midnight, the schedule shifts forward to
// start exactly at midnight instead.
func recordingSlots(n int, now time.Time, spacing time.Duration) []recordingSlot {
	if n <= 0 {
		return nil
	}
	now = now.UTC()
	const settle = 5 * time.Minute
	end := now.Add(-settle)
	start := end.Add(-time.Duration(n) * spacing)

	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	if start.Before(midnight) {
		start = midnight
	}

	slots := make([]recordingSlot, n)
	cur := start
	for i := 0; i < n; i++ {
		next := cur.Add(spacing)
		slots[i] = recordingSlot{Start: cur, End: next}
		cur = next
	}
	return slots
}
