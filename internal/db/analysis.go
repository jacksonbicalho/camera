package db

import (
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type Detection struct {
	ID          int64     `json:"id"`
	Label       string    `json:"label"`
	Confidence  float64   `json:"confidence"`
	FrameCount  int       `json:"frame_count"`
	CustomModel bool      `json:"custom_model"`
	CreatedAt   time.Time `json:"created_at"`
}

// stateClassificationTrainerIDKey is the system_config key holding which
// registered trainer (internal/db/trainers.go) state classification should
// use — replaces video_analysis_config.service_url (T3 removes that table):
// trainers/detectors already register a service_url each, so state
// classification just points at one instead of duplicating it.
const stateClassificationTrainerIDKey = "analysis.state_trainer_id"

// GetStateClassificationTrainerID returns the id of the trainer registered
// to source state classification's YOLO service URL, or nil when none is
// configured yet (state classification simply doesn't run — same effect as
// an empty service_url before) OR when the stored value is unreadable
// (corrupted/legacy) — same "config ilegível vira default silencioso"
// idiom already used by StorageSettingsFromDB (config.go).
func GetStateClassificationTrainerID(d *DB) (*int64, error) {
	all, err := GetAllConfig(d)
	if err != nil {
		return nil, fmt.Errorf("get state classification trainer id: %w", err)
	}
	v, ok := all[stateClassificationTrainerIDKey]
	if !ok || v == "" {
		return nil, nil
	}
	id, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return nil, nil
	}
	return &id, nil
}

// SetStateClassificationTrainerID persists which trainer state
// classification should use — nil clears the setting.
func SetStateClassificationTrainerID(d *DB, trainerID *int64) error {
	v := ""
	if trainerID != nil {
		v = strconv.FormatInt(*trainerID, 10)
	}
	return SetConfig(d, stateClassificationTrainerIDKey, v)
}

// GetStateClassificationServiceURL resolves the YOLO service URL state
// classification should use right now, by looking up the trainer
// configured via GetStateClassificationTrainerID. Returns "" (no error)
// when no trainer is configured, or when the configured trainer was since
// deleted — callers treat that the same as "not configured", never an
// error (mesmo comportamento de hoje com o service_url vazio).
func GetStateClassificationServiceURL(d *DB) (string, error) {
	id, err := GetStateClassificationTrainerID(d)
	if err != nil {
		return "", err
	}
	if id == nil {
		return "", nil
	}
	trainer, err := GetTrainer(d, *id)
	if err != nil {
		return "", nil
	}
	return trainer.Config["service_url"], nil
}

// CameraAnalysisConfig is a camera's own analysis setup: whether it's on,
// which registered object_detectors row it uses (nil = none chosen, the
// camera is never analyzed regardless of Enabled) and its own confidence
// threshold (nil = fall back to the analyzer's default).
type CameraAnalysisConfig struct {
	Enabled             bool
	DetectorID          *int64
	ConfidenceThreshold *float64
}

func GetCameraAnalysisConfig(d *DB, cameraID string) (CameraAnalysisConfig, error) {
	var enabled int
	var detectorID sql.NullInt64
	var threshold sql.NullFloat64
	err := d.QueryRow(`
		SELECT enabled, detector_id, confidence_threshold
		FROM camera_analysis_config WHERE camera_id=?`, cameraID).
		Scan(&enabled, &detectorID, &threshold)
	if err != nil {
		// No row means the camera was never configured — analysis defaults
		// to OFF (opt-in), not on. It used to default to Enabled:true (only
		// DetectorID being nil actually gated real analysis), but that made
		// a never-configured camera's checkbox start checked and, before T3
		// fixed the exposure, showed the "Análise de objetos" badge for a
		// camera that was never actually analyzed.
		return CameraAnalysisConfig{Enabled: false}, nil
	}
	cfg := CameraAnalysisConfig{Enabled: enabled != 0}
	if detectorID.Valid {
		cfg.DetectorID = &detectorID.Int64
	}
	if threshold.Valid {
		cfg.ConfidenceThreshold = &threshold.Float64
	}
	return cfg, nil
}

func SetCameraAnalysisConfig(d *DB, cameraID string, cfg CameraAnalysisConfig) error {
	v := 0
	if cfg.Enabled {
		v = 1
	}
	_, err := d.Exec(`
		INSERT INTO camera_analysis_config (camera_id, enabled, detector_id, confidence_threshold)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(camera_id) DO UPDATE SET
			enabled=excluded.enabled,
			detector_id=excluded.detector_id,
			confidence_threshold=excluded.confidence_threshold`,
		cameraID, v, cfg.DetectorID, cfg.ConfidenceThreshold)
	return err
}

func InsertDetections(d *DB, path string, detections []Detection, customModel bool) error {
	var recordingID int64
	err := d.QueryRow(`SELECT id FROM recordings WHERE path=?`, path).Scan(&recordingID)
	if err != nil {
		return err
	}
	cm := 0
	if customModel {
		cm = 1
	}
	for _, det := range detections {
		_, err := d.Exec(`
			INSERT INTO detections (recording_id, label, confidence, frame_count, custom_model)
			VALUES (?, ?, ?, ?, ?)`,
			recordingID, det.Label, det.Confidence, det.FrameCount, cm)
		if err != nil {
			return err
		}
	}
	return nil
}

func DetectionsByPaths(d *DB, paths []string) (map[string][]Detection, error) {
	if len(paths) == 0 {
		return nil, nil
	}
	placeholders := make([]string, len(paths))
	args := make([]any, len(paths))
	for i, p := range paths {
		placeholders[i] = "?"
		args[i] = p
	}
	rows, err := d.Query(`
		SELECT rec.path, det.label, det.confidence, det.frame_count, det.custom_model
		FROM detections det
		JOIN recordings rec ON rec.id = det.recording_id
		WHERE rec.path IN (`+strings.Join(placeholders, ",")+`)
		AND det.label != ''
		ORDER BY det.confidence DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := map[string][]Detection{}
	seen := map[string]map[string]bool{}
	for rows.Next() {
		var path string
		var det Detection
		var cm int
		if err := rows.Scan(&path, &det.Label, &det.Confidence, &det.FrameCount, &cm); err != nil {
			return nil, err
		}
		det.CustomModel = cm != 0
		if seen[path] == nil {
			seen[path] = map[string]bool{}
		}
		if !seen[path][det.Label] {
			seen[path][det.Label] = true
			result[path] = append(result[path], det)
		}
	}
	return result, rows.Err()
}

func ListDetectionsByPath(d *DB, path string) ([]Detection, error) {
	rows, err := d.Query(`
		SELECT det.id, det.label, det.confidence, det.frame_count, det.created_at
		FROM detections det
		JOIN recordings rec ON rec.id = det.recording_id
		WHERE rec.path = ?
		ORDER BY det.confidence DESC`, path)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []Detection
	for rows.Next() {
		var det Detection
		var createdAt string
		if err := rows.Scan(&det.ID, &det.Label, &det.Confidence, &det.FrameCount, &createdAt); err != nil {
			return nil, err
		}
		det.CreatedAt, _ = time.Parse(time.RFC3339, createdAt)
		result = append(result, det)
	}
	return result, rows.Err()
}

// ResetDetectionsForReanalysis deletes all detections from recordings with
// has_motion=1 and resets analysis_skipped=0, so the next analyzeNewRecordings
// cycle re-analyzes every recording with the newly trained model.
func ResetDetectionsForReanalysis(d *DB) error {
	_, err := d.Exec(`
		DELETE FROM detections
		WHERE recording_id IN (
			SELECT id FROM recordings WHERE has_motion = 1
		)`)
	if err != nil {
		return fmt.Errorf("reset detections: %w", err)
	}
	_, err = d.Exec(`
		UPDATE recordings SET analysis_skipped = 0
		WHERE has_motion = 1 AND analysis_skipped = 1`)
	if err != nil {
		return fmt.Errorf("reset analysis_skipped: %w", err)
	}
	return nil
}
