package db

import (
	"fmt"
	"time"
)

// ObjectDetector is a registered object-detection service: a stable identity
// (id/name/type) plus an arbitrary key/value config (service_url/model for
// type "yolo", model_id/api_token for "huggingface"; any future field needs
// no migration — see object_detector_config).
type ObjectDetector struct {
	ID        int64
	Name      string
	Type      string
	CreatedAt time.Time
	Config    map[string]string
}

func ListObjectDetectors(d *DB) ([]ObjectDetector, error) {
	rows, err := d.Query(`SELECT id, name, type, created_at FROM object_detectors ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list object detectors: %w", err)
	}
	defer rows.Close()

	var list []ObjectDetector
	for rows.Next() {
		var det ObjectDetector
		if err := rows.Scan(&det.ID, &det.Name, &det.Type, &det.CreatedAt); err != nil {
			return nil, fmt.Errorf("list object detectors: scan: %w", err)
		}
		list = append(list, det)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list object detectors: rows: %w", err)
	}

	for i := range list {
		cfg, err := getDetectorConfig(d, list[i].ID)
		if err != nil {
			return nil, err
		}
		list[i].Config = cfg
	}
	return list, nil
}

func GetObjectDetector(d *DB, id int64) (ObjectDetector, error) {
	var det ObjectDetector
	err := d.QueryRow(`SELECT id, name, type, created_at FROM object_detectors WHERE id=?`, id).
		Scan(&det.ID, &det.Name, &det.Type, &det.CreatedAt)
	if err != nil {
		return ObjectDetector{}, fmt.Errorf("get object detector: %w", err)
	}
	det.Config, err = getDetectorConfig(d, id)
	if err != nil {
		return ObjectDetector{}, err
	}
	return det, nil
}

// SetObjectDetectorType updates the type discriminator ("yolo"/"huggingface")
// of an already-inserted detector — kept separate from
// InsertObjectDetector/UpdateObjectDetector so their existing signatures
// (and every pre-existing caller) don't need to change.
func SetObjectDetectorType(d *DB, id int64, detectorType string) error {
	if _, err := d.Exec(`UPDATE object_detectors SET type=? WHERE id=?`, detectorType, id); err != nil {
		return fmt.Errorf("set object detector type: %w", err)
	}
	return nil
}

func InsertObjectDetector(d *DB, name string, config map[string]string) (int64, error) {
	res, err := d.Exec(`INSERT INTO object_detectors (name) VALUES (?)`, name)
	if err != nil {
		return 0, fmt.Errorf("insert object detector: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("insert object detector: last insert id: %w", err)
	}
	if err := setDetectorConfig(d, id, config); err != nil {
		return 0, err
	}
	return id, nil
}

func UpdateObjectDetector(d *DB, id int64, name string, config map[string]string) error {
	if _, err := d.Exec(`UPDATE object_detectors SET name=? WHERE id=?`, name, id); err != nil {
		return fmt.Errorf("update object detector: %w", err)
	}
	return setDetectorConfig(d, id, config)
}

func DeleteObjectDetector(d *DB, id int64) error {
	if _, err := d.Exec(`DELETE FROM object_detectors WHERE id=?`, id); err != nil {
		return fmt.Errorf("delete object detector: %w", err)
	}
	return nil
}

func getDetectorConfig(d *DB, detectorID int64) (map[string]string, error) {
	rows, err := d.Query(`SELECT key, value FROM object_detector_config WHERE detector_id=?`, detectorID)
	if err != nil {
		return nil, fmt.Errorf("get detector config: %w", err)
	}
	defer rows.Close()

	cfg := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, fmt.Errorf("get detector config: scan: %w", err)
		}
		cfg[k] = v
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get detector config: rows: %w", err)
	}
	return cfg, nil
}

// setDetectorConfig replaces a detector's config with the given key/value
// pairs (a full snapshot: stale keys are removed), same delete+insert-in-tx
// pattern as SaveDeviceInfo (device_info.go).
func setDetectorConfig(d *DB, detectorID int64, config map[string]string) error {
	tx, err := d.Begin()
	if err != nil {
		return fmt.Errorf("set detector config: begin: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM object_detector_config WHERE detector_id=?`, detectorID); err != nil {
		return fmt.Errorf("set detector config: clear: %w", err)
	}

	stmt, err := tx.Prepare(`INSERT INTO object_detector_config (detector_id, key, value) VALUES (?,?,?)`)
	if err != nil {
		return fmt.Errorf("set detector config: prepare: %w", err)
	}
	defer stmt.Close()

	for k, v := range config {
		if _, err := stmt.Exec(detectorID, k, v); err != nil {
			return fmt.Errorf("set detector config: insert %q: %w", k, err)
		}
	}
	return tx.Commit()
}
