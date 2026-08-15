package motion

import (
	"os"
	"path/filepath"
	"time"
)

type store struct {
	basePath string
	// onEvent, when set, is called for every motion event and returns
	// whether it should be broadcast/notified (e.g. false when the event has
	// no recording backing it — see saveSnapshot's caller in detector.go).
	onEvent func(cameraID string, t time.Time, score float64, frame, label, color string, bbox BBox) bool
}

func newStore(basePath string, onEvent func(cameraID string, t time.Time, score float64, frame, label, color string, bbox BBox) bool) *store {
	return &store{basePath: basePath, onEvent: onEvent}
}

// record persists the event via onEvent (if set) and returns whether it
// should be notified/broadcast — true by default when onEvent is nil.
func (s *store) record(cameraID string, ts time.Time, score float64, frame, label, color string, bbox BBox) (notify bool, err error) {
	if s.onEvent != nil {
		return s.onEvent(cameraID, ts, score, frame, label, color, bbox), nil
	}
	return true, nil
}

func (s *store) saveJPEG(cameraID string, ts time.Time, suffix string, data []byte) (name, fullPath string, err error) {
	dir := filepath.Join(s.basePath, cameraID, ts.UTC().Format("2006/01/02"))
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", "", err
	}
	name = ts.UTC().Format("20060102150405") + suffix
	fullPath = filepath.Join(dir, name)
	if err := os.WriteFile(fullPath, data, 0644); err != nil {
		return "", "", err
	}
	return name, fullPath, nil
}
