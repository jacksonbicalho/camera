package db

// telegramExtensionEnabledKey is the system_config key holding whether the
// Telegram extension (internal/extensions/telegram) is turned on for this
// instance. Instance-wide, not per-user — same idiom as
// analysis.state_trainer_id (internal/db/analysis.go).
const telegramExtensionEnabledKey = "extensions.telegram.enabled"

// GetTelegramExtensionEnabled returns whether the Telegram extension is
// enabled, defaulting to false when never configured.
func GetTelegramExtensionEnabled(d *DB) (bool, error) {
	all, err := GetAllConfig(d)
	if err != nil {
		return false, err
	}
	return all[telegramExtensionEnabledKey] == "1", nil
}

// SetTelegramExtensionEnabled persists whether the Telegram extension is
// enabled for this instance.
func SetTelegramExtensionEnabled(d *DB, enabled bool) error {
	v := "0"
	if enabled {
		v = "1"
	}
	return SetConfig(d, telegramExtensionEnabledKey, v)
}
