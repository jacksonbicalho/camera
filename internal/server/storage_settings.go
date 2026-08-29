package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"camera/internal/db"
)

const (
	keyWithMotionMinutes    = "storage.with_motion_minutes"
	keyWithoutMotionMinutes = "storage.without_motion_minutes"
	keyIntervalMinutes      = "storage.interval_minutes"
	keyMaxSizeGB            = "storage.max_size_gb"
	keyWarnPercent          = "storage.warn_percent"
)

// effectiveStorageSettings returns the active storage settings, preferring
// DB overrides over the values loaded from camera.yaml at startup.
func (s *Server) effectiveStorageSettings() (withMotion, withoutMotion, interval int, maxGB, warnPct float64) {
	r := db.StorageSettingsFromDB(s.db)
	return r.WithMotionMinutes, r.WithoutMotionMinutes, r.IntervalMinutes, r.MaxSizeGB, r.WarnPercent
}

type storageSettingsInput struct {
	WithMotionMinutes    *int     `json:"with_motion_minutes"`
	WithoutMotionMinutes *int     `json:"without_motion_minutes"`
	IntervalMinutes      *int     `json:"interval_minutes"`
	MaxSizeGB            *float64 `json:"max_size_gb"`
	WarnPercent          *float64 `json:"warn_percent"`
}

func validateStorageSettings(input storageSettingsInput) error {
	if input.WithMotionMinutes != nil && *input.WithMotionMinutes < 0 {
		return fmt.Errorf("with_motion_minutes must be >= 0 (got %d)", *input.WithMotionMinutes)
	}
	if input.WithoutMotionMinutes != nil && *input.WithoutMotionMinutes < 0 {
		return fmt.Errorf("without_motion_minutes must be >= 0 (got %d)", *input.WithoutMotionMinutes)
	}
	if input.IntervalMinutes != nil && *input.IntervalMinutes < 0 {
		return fmt.Errorf("interval_minutes must be >= 0 (got %d)", *input.IntervalMinutes)
	}
	if input.MaxSizeGB != nil && *input.MaxSizeGB < 0 {
		return fmt.Errorf("max_size_gb must be >= 0 (got %.2f)", *input.MaxSizeGB)
	}
	if input.WarnPercent != nil && (*input.WarnPercent < 0 || *input.WarnPercent > 100) {
		return fmt.Errorf("warn_percent must be between 0 and 100 (got %.2f)", *input.WarnPercent)
	}
	return nil
}

func (s *Server) handleUpdateStorageSettings(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	var input storageSettingsInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if err := validateStorageSettings(input); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	set := func(key string, val any) error {
		return db.SetConfig(s.db, key, strconv.FormatFloat(toFloat(val), 'f', -1, 64))
	}
	if input.WithMotionMinutes != nil {
		if err := db.SetConfig(s.db, keyWithMotionMinutes, strconv.Itoa(*input.WithMotionMinutes)); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}
	if input.WithoutMotionMinutes != nil {
		if err := db.SetConfig(s.db, keyWithoutMotionMinutes, strconv.Itoa(*input.WithoutMotionMinutes)); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}
	if input.IntervalMinutes != nil {
		if err := db.SetConfig(s.db, keyIntervalMinutes, strconv.Itoa(*input.IntervalMinutes)); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}
	if input.MaxSizeGB != nil {
		if err := set(keyMaxSizeGB, *input.MaxSizeGB); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}
	if input.WarnPercent != nil {
		if err := set(keyWarnPercent, *input.WarnPercent); err != nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	}
	// Trigger an immediate clean so new retention settings take effect right away.
	if s.cleaner != nil {
		s.cleaner.ForceClean()
	}
	wm, wom, interval, maxGB, warnPct := s.effectiveStorageSettings()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"with_motion_minutes":    wm,
		"without_motion_minutes": wom,
		"interval_minutes":       interval,
		"max_size_gb":            maxGB,
		"warn_percent":           warnPct,
	})
}

func toFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case *float64:
		if x != nil {
			return *x
		}
	}
	return 0
}
