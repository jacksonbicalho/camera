package main

import "time"

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
