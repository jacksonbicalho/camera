package main

import (
	"time"

	"camera/internal/db"
)

// awaitRecordingCoverage polls check on every value received from tick,
// stopping as soon as it confirms (true) instead of always waiting out
// maxTicks — a motion event covered by an already-closed recording (the
// common/healthy case) shouldn't pay any deferred wait at all, so callers
// only reach for this when the initial check found an open/uncertain row.
// Gives up (false) once maxTicks ticks have been consumed without
// confirmation. tick is caller-provided so production can wire a real
// time.Ticker while tests drive it deterministically without real sleeps.
func awaitRecordingCoverage(check func() bool, tick <-chan time.Time, maxTicks int) bool {
	for i := 0; i < maxTicks; i++ {
		<-tick
		if check() {
			return true
		}
	}
	return false
}

// deferredNotifyPollInterval/deferredNotifyMaxTicks bound the recheck below
// ~20s — well under the worst-case gap measured between a hang and the
// recorder reconnecting (~15s stall detection + reconnect_interval, which
// can itself run tens of seconds), but long enough to ride out the common
// short hiccups instead of giving up on the very next tick.
const (
	deferredNotifyPollInterval = 5 * time.Second
	deferredNotifyMaxTicks     = 4
)

// deferredNotifyMotion is awaitRecordingCoverage specialized to the "motion
// event only optimistically covered by a still-open recording" case (see
// onMotionEvent): findCovering re-runs the same coverage lookup on every
// tick, but only counts as confirmed once it returns a CLOSED recording
// (EndedAt set) — an open row means the bet the initial check made hasn't
// resolved yet either way. notify is called with the confirmed Recording
// (never the original open one — a new chunk may have taken over coverage
// by the time this resolves, with a different ID). Never calls notify if
// the cap is reached without a closed row ever showing up — "só notifica
// se for reproduzível" applied literally: silence, not a stale link.
func deferredNotifyMotion(findCovering func() (db.Recording, bool), tick <-chan time.Time, maxTicks int, notify func(db.Recording)) {
	var confirmed db.Recording
	check := func() bool {
		r, ok := findCovering()
		if !ok || r.EndedAt.IsZero() {
			return false
		}
		confirmed = r
		return true
	}
	if awaitRecordingCoverage(check, tick, maxTicks) {
		notify(confirmed)
	}
}
