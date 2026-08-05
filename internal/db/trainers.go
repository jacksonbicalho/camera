package db

import (
	"fmt"
	"time"
)

// Trainer is a registered training backend: a stable identity (id/name/type)
// plus an arbitrary key/value config (service_url for type "yolo" — same
// EAV shape as ObjectDetector's object_detector_config, so a future field
// needs no migration). Unlike ObjectDetector, the type column exists from
// the table's very first migration (no legacy pre-type rows to support).
type Trainer struct {
	ID        int64
	Name      string
	Type      string
	CreatedAt time.Time
	Config    map[string]string
}

func ListTrainers(d *DB) ([]Trainer, error) {
	rows, err := d.Query(`SELECT id, name, type, created_at FROM trainers ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list trainers: %w", err)
	}
	defer rows.Close()

	var list []Trainer
	for rows.Next() {
		var t Trainer
		if err := rows.Scan(&t.ID, &t.Name, &t.Type, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("list trainers: scan: %w", err)
		}
		list = append(list, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list trainers: rows: %w", err)
	}

	for i := range list {
		cfg, err := getTrainerConfig(d, list[i].ID)
		if err != nil {
			return nil, err
		}
		list[i].Config = cfg
	}
	return list, nil
}

func GetTrainer(d *DB, id int64) (Trainer, error) {
	var t Trainer
	err := d.QueryRow(`SELECT id, name, type, created_at FROM trainers WHERE id=?`, id).
		Scan(&t.ID, &t.Name, &t.Type, &t.CreatedAt)
	if err != nil {
		return Trainer{}, fmt.Errorf("get trainer: %w", err)
	}
	t.Config, err = getTrainerConfig(d, id)
	if err != nil {
		return Trainer{}, err
	}
	return t, nil
}

func InsertTrainer(d *DB, name, trainerType string, config map[string]string) (int64, error) {
	res, err := d.Exec(`INSERT INTO trainers (name, type) VALUES (?, ?)`, name, trainerType)
	if err != nil {
		return 0, fmt.Errorf("insert trainer: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("insert trainer: last insert id: %w", err)
	}
	if err := setTrainerConfig(d, id, config); err != nil {
		return 0, err
	}
	return id, nil
}

func UpdateTrainer(d *DB, id int64, name, trainerType string, config map[string]string) error {
	if _, err := d.Exec(`UPDATE trainers SET name=?, type=? WHERE id=?`, name, trainerType, id); err != nil {
		return fmt.Errorf("update trainer: %w", err)
	}
	return setTrainerConfig(d, id, config)
}

func DeleteTrainer(d *DB, id int64) error {
	if _, err := d.Exec(`DELETE FROM trainers WHERE id=?`, id); err != nil {
		return fmt.Errorf("delete trainer: %w", err)
	}
	return nil
}

func getTrainerConfig(d *DB, trainerID int64) (map[string]string, error) {
	rows, err := d.Query(`SELECT key, value FROM trainer_config WHERE trainer_id=?`, trainerID)
	if err != nil {
		return nil, fmt.Errorf("get trainer config: %w", err)
	}
	defer rows.Close()

	cfg := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, fmt.Errorf("get trainer config: scan: %w", err)
		}
		cfg[k] = v
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get trainer config: rows: %w", err)
	}
	return cfg, nil
}

// setTrainerConfig replaces a trainer's config with the given key/value
// pairs (a full snapshot: stale keys are removed), same delete+insert-in-tx
// pattern as setDetectorConfig (detectors.go).
func setTrainerConfig(d *DB, trainerID int64, config map[string]string) error {
	tx, err := d.Begin()
	if err != nil {
		return fmt.Errorf("set trainer config: begin: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM trainer_config WHERE trainer_id=?`, trainerID); err != nil {
		return fmt.Errorf("set trainer config: clear: %w", err)
	}

	stmt, err := tx.Prepare(`INSERT INTO trainer_config (trainer_id, key, value) VALUES (?,?,?)`)
	if err != nil {
		return fmt.Errorf("set trainer config: prepare: %w", err)
	}
	defer stmt.Close()

	for k, v := range config {
		if _, err := stmt.Exec(trainerID, k, v); err != nil {
			return fmt.Errorf("set trainer config: insert %q: %w", k, err)
		}
	}
	return tx.Commit()
}
