package db

import (
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"time"

	"camera/internal/stateclass"
)

// Canais de destinatário (chaves em user_settings: "{channel}:{classifierID}").
const (
	permNotify = "state_notify"
	permFooter = "state_footer"
)

func permKey(channel string, classifierID int64) string {
	return channel + ":" + strconv.FormatInt(classifierID, 10)
}

// setChannelRecipients substitui o conjunto de destinatários de um canal do
// classificador (numa tx): apaga as chaves e reinsere as dos usuários dados.
func setChannelRecipients(tx *sql.Tx, classifierID int64, channel string, userIDs []int64) error {
	key := permKey(channel, classifierID)
	if _, err := tx.Exec(`DELETE FROM user_settings WHERE key = ?`, key); err != nil {
		return err
	}
	for _, uid := range userIDs {
		if _, err := tx.Exec(
			`INSERT OR IGNORE INTO user_settings (user_id, key, value) VALUES (?, ?, '1')`, uid, key,
		); err != nil {
			return err
		}
	}
	return nil
}

// loadChannelRecipients lê os user ids destinatários de um canal do classificador.
func loadChannelRecipients(q interface {
	Query(string, ...any) (*sql.Rows, error)
}, classifierID int64, channel string) ([]int64, error) {
	rows, err := q.Query(
		`SELECT user_id FROM user_settings WHERE key = ? AND value = '1' ORDER BY user_id`,
		permKey(channel, classifierID),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// loadClasses returns the ordered class labels of a classifier.
func loadClasses(q interface {
	Query(string, ...any) (*sql.Rows, error)
}, classifierID int64) ([]string, error) {
	rows, err := q.Query(
		`SELECT label FROM camera_state_classes WHERE classifier_id = ? ORDER BY display_order, label`,
		classifierID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	classes := []string{}
	for rows.Next() {
		var l string
		if err := rows.Scan(&l); err != nil {
			return nil, err
		}
		classes = append(classes, l)
	}
	return classes, rows.Err()
}

func scanClassifier(s interface{ Scan(...any) error }) (stateclass.Classifier, error) {
	var c stateclass.Classifier
	var triggerMotion, enabled, notifyEnabled, footerEnabled int
	var historyRetention sql.NullInt64
	err := s.Scan(
		&c.ID, &c.CameraID, &c.Name, &c.Model, &c.Threshold,
		&triggerMotion, &c.TriggerIntervalSeconds,
		&c.CropX, &c.CropY, &c.CropW, &c.CropH,
		&c.MinConsecutive, &enabled, &notifyEnabled, &footerEnabled,
		&historyRetention,
	)
	c.TriggerMotion = triggerMotion != 0
	c.Enabled = enabled != 0
	c.NotifyEnabled = notifyEnabled != 0
	c.FooterEnabled = footerEnabled != 0
	if historyRetention.Valid {
		v := int(historyRetention.Int64)
		c.HistoryRetentionMinutes = &v
	}
	return c, err
}

const classifierCols = `id, camera_id, name, model, threshold,
	trigger_motion, trigger_interval_seconds,
	crop_x, crop_y, crop_w, crop_h, min_consecutive, enabled, notify_enabled, footer_enabled,
	history_retention_minutes`

// ClassifierNameTaken reports whether another classifier of the same camera already
// uses `name` — pré-check antes de create/update (mesmo padrão de SetUserEmail/
// SetUsername em users.go), pra devolver um erro amigável em vez de deixar a
// violação da UNIQUE(camera_id, name) estourar como erro genérico de banco.
// excludeID (0 em create) deixa o próprio classificador de fora da checagem, pra
// update não se autobloquear ao salvar sem mudar o nome.
func ClassifierNameTaken(database *DB, cameraID, name string, excludeID int64) (bool, error) {
	var existingID int64
	err := database.QueryRow(
		`SELECT id FROM camera_state_classifiers WHERE camera_id = ? AND name = ? AND id != ?`,
		cameraID, name, excludeID,
	).Scan(&existingID)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return false, fmt.Errorf("check classifier name: %w", err)
}

// CreateStateClassifier inserts a classifier and its classes, returning the new id.
func CreateStateClassifier(database *DB, c stateclass.Classifier) (int64, error) {
	tx, err := database.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck

	res, err := tx.Exec(
		`INSERT INTO camera_state_classifiers
		 (camera_id, name, model, threshold, trigger_motion, trigger_interval_seconds,
		  crop_x, crop_y, crop_w, crop_h, min_consecutive, enabled, notify_enabled, footer_enabled,
		  history_retention_minutes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.CameraID, c.Name, c.Model, c.Threshold, boolToInt(c.TriggerMotion), c.TriggerIntervalSeconds,
		c.CropX, c.CropY, c.CropW, c.CropH, c.MinConsecutive, boolToInt(c.Enabled),
		boolToInt(c.NotifyEnabled), boolToInt(c.FooterEnabled), nullIntPtr(c.HistoryRetentionMinutes),
	)
	if err != nil {
		return 0, fmt.Errorf("insert classifier: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	if err := insertClasses(tx, id, c.Classes); err != nil {
		return 0, err
	}
	if err := setChannelRecipients(tx, id, permNotify, c.NotifyUserIDs); err != nil {
		return 0, err
	}
	if err := setChannelRecipients(tx, id, permFooter, c.FooterUserIDs); err != nil {
		return 0, err
	}
	return id, tx.Commit()
}

func insertClasses(tx *sql.Tx, classifierID int64, classes []string) error {
	for i, label := range classes {
		if _, err := tx.Exec(
			`INSERT INTO camera_state_classes (classifier_id, label, display_order) VALUES (?, ?, ?)`,
			classifierID, label, i,
		); err != nil {
			return fmt.Errorf("insert class %q: %w", label, err)
		}
	}
	return nil
}

// ListStateClassifiers returns the classifiers of a camera (with their classes).
func ListStateClassifiers(database *DB, cameraID string) ([]stateclass.Classifier, error) {
	rows, err := database.Query(
		`SELECT `+classifierCols+` FROM camera_state_classifiers WHERE camera_id = ? ORDER BY id`,
		cameraID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []stateclass.Classifier{}
	for rows.Next() {
		c, err := scanClassifier(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		classes, err := loadClasses(database, out[i].ID)
		if err != nil {
			return nil, err
		}
		out[i].Classes = classes
		if out[i].NotifyUserIDs, err = loadChannelRecipients(database, out[i].ID, permNotify); err != nil {
			return nil, err
		}
		if out[i].FooterUserIDs, err = loadChannelRecipients(database, out[i].ID, permFooter); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// GetStateClassifier returns one classifier (with classes), or sql.ErrNoRows.
func GetStateClassifier(database *DB, id int64) (stateclass.Classifier, error) {
	row := database.QueryRow(
		`SELECT `+classifierCols+` FROM camera_state_classifiers WHERE id = ?`, id,
	)
	c, err := scanClassifier(row)
	if err != nil {
		return c, err
	}
	if c.Classes, err = loadClasses(database, id); err != nil {
		return c, err
	}
	if c.NotifyUserIDs, err = loadChannelRecipients(database, id, permNotify); err != nil {
		return c, err
	}
	c.FooterUserIDs, err = loadChannelRecipients(database, id, permFooter)
	return c, err
}

// UpdateStateClassifier updates a classifier and replaces its classes.
func UpdateStateClassifier(database *DB, c stateclass.Classifier) error {
	tx, err := database.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.Exec(
		`UPDATE camera_state_classifiers SET
		   name = ?, model = ?, threshold = ?, trigger_motion = ?, trigger_interval_seconds = ?,
		   crop_x = ?, crop_y = ?, crop_w = ?, crop_h = ?, min_consecutive = ?, enabled = ?,
		   notify_enabled = ?, footer_enabled = ?, history_retention_minutes = ?
		 WHERE id = ?`,
		c.Name, c.Model, c.Threshold, boolToInt(c.TriggerMotion), c.TriggerIntervalSeconds,
		c.CropX, c.CropY, c.CropW, c.CropH, c.MinConsecutive, boolToInt(c.Enabled),
		boolToInt(c.NotifyEnabled), boolToInt(c.FooterEnabled), nullIntPtr(c.HistoryRetentionMinutes), c.ID,
	); err != nil {
		return fmt.Errorf("update classifier: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM camera_state_classes WHERE classifier_id = ?`, c.ID); err != nil {
		return err
	}
	if err := insertClasses(tx, c.ID, c.Classes); err != nil {
		return err
	}
	if err := setChannelRecipients(tx, c.ID, permNotify, c.NotifyUserIDs); err != nil {
		return err
	}
	if err := setChannelRecipients(tx, c.ID, permFooter, c.FooterUserIDs); err != nil {
		return err
	}
	return tx.Commit()
}

// FooterClassifier é um classificador que um usuário deve ver no rodapé.
type FooterClassifier struct {
	ID       int64
	CameraID string
	Name     string
}

// FooterClassifiersForUser devolve os classificadores com `footer_enabled` em que
// `userID` é destinatário do canal footer (chave state_footer:{id} em user_settings).
func FooterClassifiersForUser(database *DB, userID int64) ([]FooterClassifier, error) {
	rows, err := database.Query(
		`SELECT c.id, c.camera_id, c.name
		 FROM camera_state_classifiers c
		 JOIN user_settings p
		   ON p.user_id = ? AND p.value = '1' AND p.key = 'state_footer:' || c.id
		 WHERE c.footer_enabled = 1
		 ORDER BY c.id`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FooterClassifier{}
	for rows.Next() {
		var f FooterClassifier
		if err := rows.Scan(&f.ID, &f.CameraID, &f.Name); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// DeleteStateClassifier removes a classifier (classes/history cascade) e limpa as
// chaves de destinatário em user_settings (não há FK pro classificador).
func DeleteStateClassifier(database *DB, id int64) error {
	tx, err := database.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	if _, err := tx.Exec(`DELETE FROM camera_state_classifiers WHERE id = ?`, id); err != nil {
		return err
	}
	for _, ch := range []string{permNotify, permFooter} {
		if _, err := tx.Exec(`DELETE FROM user_settings WHERE key = ?`, permKey(ch, id)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// RecordStateTransition appends a confirmed state to a classifier's history.
// framePath é o caminho servível do thumbnail da transição ("" quando não houver).
func RecordStateTransition(database *DB, classifierID int64, state string, confidence float64, framePath string) error {
	_, err := database.Exec(
		`INSERT INTO camera_state_history (classifier_id, state, confidence, frame_path) VALUES (?, ?, ?, ?)`,
		classifierID, state, confidence, framePath,
	)
	return err
}

// StateHistoryEntry é uma transição registrada no histórico de um classificador.
type StateHistoryEntry struct {
	State              string
	Confidence         float64
	ChangedAt          time.Time
	FramePath          string
	RecordingAvailable bool
}

// ListStateHistory devolve as transições mais recentes de um classificador (mais
// novas primeiro). Só transições COM thumbnail (frame_path != '') entram — registros
// legados sem imagem (anteriores à coluna) ou falhas de gravação do frame ficam de
// fora. RecordingAvailable indica se ainda existe uma gravação cobrindo o instante da
// transição — os thumbs sobrevivem à retenção das gravações, então o histórico pode
// apontar pra vídeo já expirado. Ambos os lados da comparação passam por datetime()
// porque recordings grava em RFC3339 e changed_at em 'YYYY-MM-DD HH:MM:SS'.
func ListStateHistory(database *DB, classifierID int64, limit int) ([]StateHistoryEntry, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := database.Query(
		`SELECT h.state, h.confidence, h.changed_at, h.frame_path,
		        EXISTS(SELECT 1 FROM recordings r
		               WHERE r.camera_id = c.camera_id
		                 AND datetime(r.started_at) <= datetime(h.changed_at)
		                 AND (r.ended_at IS NULL OR datetime(h.changed_at) < datetime(r.ended_at))) AS rec_avail
		 FROM camera_state_history h
		 JOIN camera_state_classifiers c ON c.id = h.classifier_id
		 WHERE h.classifier_id = ? AND h.frame_path != ''
		 ORDER BY h.changed_at DESC, h.id DESC
		 LIMIT ?`,
		classifierID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StateHistoryEntry{}
	for rows.Next() {
		var e StateHistoryEntry
		if err := rows.Scan(&e.State, &e.Confidence, &e.ChangedAt, &e.FramePath, &e.RecordingAvailable); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// CameraStateTransition é uma transição de estado (com thumbnail) de qualquer
// classificador de uma câmera, usada para mesclar no feed de eventos da câmera.
type CameraStateTransition struct {
	ID             int64
	ClassifierID   int64
	ClassifierName string
	State          string
	Confidence     float64
	ChangedAt      time.Time
	FramePath      string
}

// ListCameraStateTransitions devolve as transições de estado de TODOS os
// classificadores de uma câmera no intervalo [start, end), mais antigas primeiro.
// Espelha o filtro de ListStateHistory (só com thumbnail, frame_path != ''). Ambos
// os lados da comparação de tempo passam por datetime() porque changed_at é gravado
// em 'YYYY-MM-DD HH:MM:SS' (UTC).
func ListCameraStateTransitions(database *DB, cameraID string, start, end time.Time) ([]CameraStateTransition, error) {
	rows, err := database.Query(
		`SELECT h.id, c.id, c.name, h.state, h.confidence, h.changed_at, h.frame_path
		 FROM camera_state_history h
		 JOIN camera_state_classifiers c ON c.id = h.classifier_id
		 WHERE c.camera_id = ? AND h.frame_path != ''
		   AND datetime(h.changed_at) >= datetime(?)
		   AND datetime(h.changed_at) < datetime(?)
		 ORDER BY h.changed_at, h.id`,
		cameraID,
		start.UTC().Format("2006-01-02 15:04:05"),
		end.UTC().Format("2006-01-02 15:04:05"),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CameraStateTransition{}
	for rows.Next() {
		var e CameraStateTransition
		if err := rows.Scan(&e.ID, &e.ClassifierID, &e.ClassifierName, &e.State, &e.Confidence, &e.ChangedAt, &e.FramePath); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ClassifierRetention pairs a classifier id with its optional history
// retention override (nil = inherits the global storage.state_history_minutes
// default).
type ClassifierRetention struct {
	ID                      int64
	HistoryRetentionMinutes *int
}

// ListStateClassifierRetentions returns id + history_retention_minutes for
// every classifier — used by the Cleaner to resolve the effective retention
// window per classifier (an explicit override, including 0, takes precedence
// over the global default).
func ListStateClassifierRetentions(database *DB) ([]ClassifierRetention, error) {
	rows, err := database.Query(`SELECT id, history_retention_minutes FROM camera_state_classifiers`)
	if err != nil {
		return nil, fmt.Errorf("list state classifier retentions: %w", err)
	}
	defer rows.Close()

	var out []ClassifierRetention
	for rows.Next() {
		var r ClassifierRetention
		var v sql.NullInt64
		if err := rows.Scan(&r.ID, &v); err != nil {
			return nil, err
		}
		if v.Valid {
			n := int(v.Int64)
			r.HistoryRetentionMinutes = &n
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListStateClassifierIDs returns the ids of every classifier that currently
// exists, across all cameras — used to tell apart live vs. orphaned disk
// directories (state_history/state_samples), which are keyed by classifier id
// but don't carry a FK back to the DB row.
func ListStateClassifierIDs(database *DB) ([]int64, error) {
	rows, err := database.Query(`SELECT id FROM camera_state_classifiers`)
	if err != nil {
		return nil, fmt.Errorf("list state classifier ids: %w", err)
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// PurgeStateHistoryOlderThan deletes camera_state_history rows of the given
// classifier older than cutoff, returning the frame_path of each deleted row
// that had one (empty ones excluded) so the caller can remove the backing
// JPEGs from disk.
func PurgeStateHistoryOlderThan(database *DB, classifierID int64, cutoff time.Time) ([]string, error) {
	cutoffStr := cutoff.UTC().Format("2006-01-02 15:04:05")

	rows, err := database.Query(
		`SELECT frame_path FROM camera_state_history
		 WHERE classifier_id = ? AND datetime(changed_at) < datetime(?) AND frame_path != ''`,
		classifierID, cutoffStr,
	)
	if err != nil {
		return nil, fmt.Errorf("select state history: %w", err)
	}
	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			rows.Close()
			return nil, err
		}
		paths = append(paths, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if _, err := database.Exec(
		`DELETE FROM camera_state_history WHERE classifier_id = ? AND datetime(changed_at) < datetime(?)`,
		classifierID, cutoffStr,
	); err != nil {
		return nil, fmt.Errorf("delete state history: %w", err)
	}
	return paths, nil
}

// GetCurrentState returns the latest state of a classifier, or nil when none yet.
func GetCurrentState(database *DB, classifierID int64) (*stateclass.State, error) {
	row := database.QueryRow(
		`SELECT state, confidence, changed_at FROM camera_state_history
		 WHERE classifier_id = ? ORDER BY changed_at DESC, id DESC LIMIT 1`,
		classifierID,
	)
	var st stateclass.State
	err := row.Scan(&st.State, &st.Confidence, &st.ChangedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &st, nil
}
