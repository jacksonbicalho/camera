package db_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"camera/internal/db"
)

// TestDropStateClassificationMigration cobre a história
// chore/remover-classificacao-estados-backend — a migration
// 0053_drop_state_classification.sql precisa derrubar as 3 tabelas de
// classificação de estado e limpar as chaves órfãs state_notify:{id}/
// state_footer:{id} de user_settings, sem afetar outras chaves.
//
// Diferente da migration puramente DELETE de 0052 (idempotente, pode ser
// reexecutada à mão depois de seedar dado órfão), esta migration tem 3
// DROP TABLE — não re-executáveis: applyMigrations já aplica TODA migration
// (inclusive esta) automaticamente em qualquer openTestDB, então por linha
// nenhuma migration "pendente" sobra pra reexecutar manualmente feito 0052.
// Por isso o teste se divide em duas partes: (a) o DROP das 3 tabelas é
// verificado pelo estado observado APÓS um openTestDB normal (nenhuma
// reexecução — já é a garantia real de que qualquer banco novo nunca mais
// tem essas tabelas); (b) a limpeza de user_settings precisa de dado órfão
// seedado, então reexecuta só a última instrução (DELETE) do arquivo — as
// 3 primeiras (DROP TABLE) não são reexecutáveis (a tabela já não existe).
func TestDropStateClassificationMigration(t *testing.T) {
	t.Run("CA6: as 3 tabelas de classificação de estado não existem após a migração normal do banco", func(t *testing.T) {
		database := openTestDB(t)
		for _, table := range []string{"camera_state_classifiers", "camera_state_classes", "camera_state_history"} {
			var name string
			err := database.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&name)
			if err == nil {
				t.Errorf("tabela %s não deveria existir em nenhum banco novo", table)
			}
		}
	})

	t.Run("CA6: limpa as chaves órfãs state_notify/state_footer de user_settings, preserva outras chaves", func(t *testing.T) {
		database := openTestDB(t)

		cam, err := db.CreateCamera(database, makeCamera("cam1"), nil)
		if err != nil {
			t.Fatalf("CreateCamera: %v", err)
		}
		uid, err := db.CreateUser(database, "viewer", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("CreateUser: %v", err)
		}
		// Simula o backlog de um banco real que tinha classificadores antes do
		// upgrade: as chaves de canal (state_notify:{id}/state_footer:{id}) ficam
		// órfãs em user_settings mesmo depois das 3 tabelas terem sido dropadas
		// (o DROP TABLE não sabe nada sobre user_settings — é uma tabela genérica
		// à parte).
		if _, err := database.Exec(
			`INSERT INTO user_settings(user_id, key, value) VALUES (?, ?, ?)`,
			uid, "state_notify:1", "1",
		); err != nil {
			t.Fatalf("insert state_notify grant: %v", err)
		}
		if _, err := database.Exec(
			`INSERT INTO user_settings(user_id, key, value) VALUES (?, ?, ?)`,
			uid, "state_footer:1", "1",
		); err != nil {
			t.Fatalf("insert state_footer grant: %v", err)
		}
		// Chave não relacionada — deve sobreviver à limpeza.
		if err := db.SetUserCameras(database, uid, []string{cam.ID}); err != nil {
			t.Fatalf("SetUserCameras: %v", err)
		}

		sqlBytes, err := os.ReadFile(filepath.Join("migrations", "0053_drop_state_classification.sql"))
		if err != nil {
			t.Fatalf("read migration file: %v", err)
		}
		stmts := strings.Split(string(sqlBytes), ";")
		deleteStmt := strings.TrimSpace(stmts[len(stmts)-2]) // último ";" produz um resto vazio
		if !strings.HasPrefix(deleteStmt, "DELETE FROM user_settings") {
			t.Fatalf("esperava a última instrução ser o DELETE de limpeza, got %q", deleteStmt)
		}
		if _, err := database.Exec(deleteStmt); err != nil {
			t.Fatalf("exec delete statement: %v", err)
		}

		var orphanCount int
		if err := database.QueryRow(
			`SELECT COUNT(*) FROM user_settings WHERE key LIKE 'state_notify:%' OR key LIKE 'state_footer:%'`,
		).Scan(&orphanCount); err != nil {
			t.Fatalf("count orphan grants: %v", err)
		}
		if orphanCount != 0 {
			t.Errorf("esperava 0 chaves state_notify/state_footer após a limpeza, got %d", orphanCount)
		}

		cams, err := db.GetUserCameras(database, uid)
		if err != nil {
			t.Fatalf("GetUserCameras: %v", err)
		}
		if len(cams) != 1 || cams[0] != cam.ID {
			t.Errorf("concessão de câmera (não relacionada) deveria sobreviver à limpeza, got %v", cams)
		}
	})
}
