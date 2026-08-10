package db

import "time"

// RetentionExtension is the (at most 1) configured S3 destination used by
// the retention "send_to_drive" action — S3 is a singleton extension (ver
// internal/extensions/s3), não múltiplos destinos nomeados; o enforcement
// de "no máximo 1 linha" vive em InsertRetentionExtension, não em constraint
// de schema (mesmo idioma de ClassifierNameTaken: checagem em Go antes do
// insert).
type RetentionExtension struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Endpoint  string    `json:"endpoint"`
	Bucket    string    `json:"bucket"`
	Region    string    `json:"region"`
	AccessKey string    `json:"access_key"`
	SecretKey string    `json:"secret_key"`
	Prefix    string    `json:"prefix"`
	CreatedAt time.Time `json:"created_at"`
}

type RetentionConfig struct {
	Category             string `json:"category"`
	Action               string `json:"action"`
	RetentionExtensionID string `json:"retention_extension_id,omitempty"`
}

func ListRetentionExtensions(d *DB) ([]RetentionExtension, error) {
	rows, err := d.Query(`
		SELECT id, name, type, endpoint, bucket, region, access_key, secret_key, prefix, created_at
		FROM retention_extensions ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RetentionExtension
	for rows.Next() {
		var re RetentionExtension
		var createdAt string
		if err := rows.Scan(&re.ID, &re.Name, &re.Type, &re.Endpoint, &re.Bucket,
			&re.Region, &re.AccessKey, &re.SecretKey, &re.Prefix, &createdAt); err != nil {
			return nil, err
		}
		re.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		out = append(out, re)
	}
	return out, rows.Err()
}

func GetRetentionExtension(d *DB, id string) (RetentionExtension, error) {
	var re RetentionExtension
	var createdAt string
	err := d.QueryRow(`
		SELECT id, name, type, endpoint, bucket, region, access_key, secret_key, prefix, created_at
		FROM retention_extensions WHERE id = ?`, id).
		Scan(&re.ID, &re.Name, &re.Type, &re.Endpoint, &re.Bucket,
			&re.Region, &re.AccessKey, &re.SecretKey, &re.Prefix, &createdAt)
	if err != nil {
		return RetentionExtension{}, err
	}
	re.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
	return re, nil
}

// HasRetentionExtension reports whether a retention extension is already
// configured — S3 is a singleton, so the server checks this before
// InsertRetentionExtension and rejects a 2nd creation with 409 (same idiom
// as ClassifierNameTaken: the uniqueness check lives here, the HTTP status
// mapping lives in the handler).
func HasRetentionExtension(d *DB) (bool, error) {
	var count int
	if err := d.QueryRow(`SELECT COUNT(*) FROM retention_extensions`).Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func InsertRetentionExtension(d *DB, re RetentionExtension) (RetentionExtension, error) {
	var id string
	err := d.QueryRow(`
		INSERT INTO retention_extensions (name, type, endpoint, bucket, region, access_key, secret_key, prefix)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING id`,
		re.Name, re.Type, re.Endpoint, re.Bucket, re.Region, re.AccessKey, re.SecretKey, re.Prefix,
	).Scan(&id)
	if err != nil {
		return RetentionExtension{}, err
	}
	return GetRetentionExtension(d, id)
}

func UpdateRetentionExtension(d *DB, re RetentionExtension) error {
	_, err := d.Exec(`
		UPDATE retention_extensions SET name=?, type=?, endpoint=?, bucket=?, region=?, access_key=?, secret_key=?, prefix=?
		WHERE id=?`,
		re.Name, re.Type, re.Endpoint, re.Bucket, re.Region, re.AccessKey, re.SecretKey, re.Prefix, re.ID)
	return err
}

func DeleteRetentionExtension(d *DB, id string) error {
	// Reset retention configs before deleting so the WHERE clause can still
	// match (the FK ON DELETE SET DEFAULT would NULL retention_extension_id first otherwise).
	if _, err := d.Exec(`UPDATE retention_config SET action='delete', retention_extension_id=NULL WHERE retention_extension_id=?`, id); err != nil {
		return err
	}
	_, err := d.Exec(`DELETE FROM retention_extensions WHERE id=?`, id)
	return err
}

func ListRetentionConfigs(d *DB) ([]RetentionConfig, error) {
	rows, err := d.Query(`SELECT category, action, COALESCE(retention_extension_id,'') FROM retention_config ORDER BY category`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var configs []RetentionConfig
	for rows.Next() {
		var rc RetentionConfig
		if err := rows.Scan(&rc.Category, &rc.Action, &rc.RetentionExtensionID); err != nil {
			return nil, err
		}
		configs = append(configs, rc)
	}
	return configs, rows.Err()
}

func UpdateRetentionConfig(d *DB, rc RetentionConfig) error {
	extID := interface{}(nil)
	if rc.RetentionExtensionID != "" {
		extID = rc.RetentionExtensionID
	}
	_, err := d.Exec(`
		INSERT INTO retention_config (category, action, retention_extension_id) VALUES (?, ?, ?)
		ON CONFLICT(category) DO UPDATE SET action=excluded.action, retention_extension_id=excluded.retention_extension_id`,
		rc.Category, rc.Action, extID)
	return err
}
