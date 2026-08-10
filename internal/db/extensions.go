package db

// extensionActiveKey builds the system_config key holding whether an
// extension (internal/extensions/<id>) is turned on for this instance.
// Instance-wide, not per-user — same idiom as analysis.state_trainer_id
// (internal/db/analysis.go). The literal suffix is kept as "enabled" for
// backward compatibility with data already persisted by earlier releases
// (e.g. "extensions.telegram.enabled") — only the Go-level name says
// "Active", to disambiguate from config.ExtensionsConfig's own Enabled
// field ("permitida no sistema", a different concept read from the YAML
// bootstrap file, not from this table).
func extensionActiveKey(id string) string {
	return "extensions." + id + ".enabled"
}

// GetExtensionActive returns whether the extension identified by id is
// active for this instance, defaulting to false when never configured.
func GetExtensionActive(d *DB, id string) (bool, error) {
	all, err := GetAllConfig(d)
	if err != nil {
		return false, err
	}
	return all[extensionActiveKey(id)] == "1", nil
}

// SetExtensionActive persists whether the extension identified by id is
// active for this instance.
func SetExtensionActive(d *DB, id string, active bool) error {
	v := "0"
	if active {
		v = "1"
	}
	return SetConfig(d, extensionActiveKey(id), v)
}
