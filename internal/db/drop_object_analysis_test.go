package db_test

import "testing"

// TestDropObjectAnalysisMigration cobre a história chore/remover-analise-objetos
// (T1) — a migration 0054_drop_object_analysis.sql precisa derrubar as 7 tabelas
// do domínio de análise/detecção de objetos e fine-tuning, e a coluna
// recordings.analysis_skipped, em qualquer banco novo (applyMigrations já aplica
// todas as migrations automaticamente em openTestDB — não há nada "pendente" pra
// reexecutar à mão, diferente de uma migration idempotente tipo 0052).
func TestDropObjectAnalysisMigration(t *testing.T) {
	t.Run("CA4: as 7 tabelas de análise de objetos não existem após a migração normal do banco", func(t *testing.T) {
		database := openTestDB(t)
		tables := []string{
			"detections",
			"camera_analysis_config",
			"annotations",
			"object_detectors",
			"object_detector_config",
			"trainers",
			"trainer_config",
		}
		for _, table := range tables {
			var name string
			err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&name)
			if err == nil {
				t.Errorf("tabela %s não deveria existir em nenhum banco novo", table)
			}
		}
	})

	t.Run("CA4: a coluna recordings.analysis_skipped não existe após a migração normal do banco", func(t *testing.T) {
		database := openTestDB(t)
		rows, err := database.Query(`PRAGMA table_info(recordings)`)
		if err != nil {
			t.Fatalf("PRAGMA table_info(recordings): %v", err)
		}
		defer rows.Close()

		for rows.Next() {
			var (
				cid        int
				name       string
				colType    string
				notNull    int
				dfltValue  any
				primaryKey int
			)
			if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &primaryKey); err != nil {
				t.Fatalf("scan pragma row: %v", err)
			}
			if name == "analysis_skipped" {
				t.Errorf("coluna recordings.analysis_skipped não deveria existir em nenhum banco novo")
			}
		}
		if err := rows.Err(); err != nil {
			t.Fatalf("iterate pragma rows: %v", err)
		}
	})
}
