package db

import (
	"fmt"
	"strconv"
)

// SetConfig inserts or replaces the value for the given key.
func SetConfig(db *DB, key, value string) error {
	_, err := db.Exec(
		`INSERT INTO system_config(key, value) VALUES(?,?)
		 ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
		key, value,
	)
	if err != nil {
		return fmt.Errorf("set config %q: %w", key, err)
	}
	return nil
}

// GetAllConfig returns all key-value pairs from system_config.
func GetAllConfig(db *DB) (map[string]string, error) {
	rows, err := db.Query(`SELECT key, value FROM system_config ORDER BY key`)
	if err != nil {
		return nil, fmt.Errorf("get all config: %w", err)
	}
	defer rows.Close()

	result := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, fmt.Errorf("scan config row: %w", err)
		}
		result[k] = v
	}
	return result, rows.Err()
}

// ResolvedStorageSettings holds the effective storage settings read from the database.
type ResolvedStorageSettings struct {
	WithMotionMinutes    int
	WithoutMotionMinutes int
	IntervalMinutes      int
	MaxSizeGB            float64
	WarnPercent          float64
	StateHistoryMinutes  int
}

// DefaultStorageSettings are the hardcoded defaults used when a key is absent from the database.
var DefaultStorageSettings = ResolvedStorageSettings{
	WithMotionMinutes:    10080, // 7 days
	WithoutMotionMinutes: 1440,  // 1 day
	IntervalMinutes:      60,
	MaxSizeGB:            0, // unlimited
	WarnPercent:          70,
	StateHistoryMinutes:  129600, // 90 days — thumbs outlive video retention on purpose, but not forever
}

// StorageNonNegativeIntOverride returns the parsed value of a non-negative
// integer storage config key from a system_config snapshot (as returned by
// GetAllConfig), and whether it is present and valid. A missing key, an
// unparseable value, or a negative value (legacy data persisted before
// validation existed on the write path) all report ok=false, so callers keep
// whatever value they'd otherwise use — same treatment for "absent" and
// "invalid". Exported so callers with their own fallback semantics (e.g.
// storage.Cleaner, which falls back to a construction-time value instead of
// DefaultStorageSettings) can reuse this single validation rule instead of
// re-parsing storage config keys themselves.
func StorageNonNegativeIntOverride(all map[string]string, key string) (int, bool) {
	v, ok := all[key]
	if !ok {
		return 0, false
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return 0, false
	}
	return n, true
}

// StorageSettingsFromDB reads storage settings from the database, falling back to
// DefaultStorageSettings for any key that is missing, unparseable, or out of range
// (negative minutes/GB, warn_percent outside [0, 100]) — legacy data persisted
// before validation existed on the write path is sanitized the same way as a
// parse error, rather than surfaced as-is.
// If database is nil, returns DefaultStorageSettings.
func StorageSettingsFromDB(database *DB) ResolvedStorageSettings {
	result := DefaultStorageSettings
	if database == nil {
		return result
	}
	all, err := GetAllConfig(database)
	if err != nil {
		return result
	}
	if n, ok := StorageNonNegativeIntOverride(all, "storage.with_motion_minutes"); ok {
		result.WithMotionMinutes = n
	}
	if n, ok := StorageNonNegativeIntOverride(all, "storage.without_motion_minutes"); ok {
		result.WithoutMotionMinutes = n
	}
	if n, ok := StorageNonNegativeIntOverride(all, "storage.interval_minutes"); ok {
		result.IntervalMinutes = n
	}
	if v, ok := all["storage.max_size_gb"]; ok {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 {
			result.MaxSizeGB = f
		}
	}
	if v, ok := all["storage.warn_percent"]; ok {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 && f <= 100 {
			result.WarnPercent = f
		}
	}
	if v, ok := all["storage.state_history_minutes"]; ok {
		if n, err := strconv.Atoi(v); err == nil {
			result.StateHistoryMinutes = n
		}
	}
	return result
}

// EnsureStorageDefaults writes DefaultStorageSettings into the database for any key
// that does not yet exist. Safe to call on every startup — never overwrites existing values.
func EnsureStorageDefaults(database *DB) error {
	d := DefaultStorageSettings
	pairs := map[string]string{
		"storage.with_motion_minutes":    strconv.Itoa(d.WithMotionMinutes),
		"storage.without_motion_minutes": strconv.Itoa(d.WithoutMotionMinutes),
		"storage.interval_minutes":       strconv.Itoa(d.IntervalMinutes),
		"storage.max_size_gb":            strconv.FormatFloat(d.MaxSizeGB, 'f', -1, 64),
		"storage.warn_percent":           strconv.FormatFloat(d.WarnPercent, 'f', -1, 64),
		"storage.state_history_minutes":  strconv.Itoa(d.StateHistoryMinutes),
	}
	for k, v := range pairs {
		if _, err := database.Exec(
			`INSERT OR IGNORE INTO system_config(key, value) VALUES(?,?)`, k, v,
		); err != nil {
			return fmt.Errorf("ensure storage default %q: %w", k, err)
		}
	}
	return nil
}
