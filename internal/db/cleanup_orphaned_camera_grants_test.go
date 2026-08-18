package db_test

import (
	"os"
	"path/filepath"
	"testing"

	"camera/internal/db"
)

// CA3: a migration 0052_cleanup_orphaned_camera_grants.sql precisa remover
// concessões user_settings cuja câmera não existe mais (órfãs de deleções
// anteriores ao fix do T1, ex. o banco real do navigator), sem afetar
// concessões válidas. O texto da migration é lido do arquivo (não
// reescrito à mão), então o teste sempre exercita a versão publicada.
func TestCleanupOrphanedCameraGrantsMigration(t *testing.T) {
	t.Run("CA3: remove concessões órfãs, preserva concessões válidas", func(t *testing.T) {
		database := openTestDB(t)

		cam, err := db.CreateCamera(database, makeCamera("existente"), nil)
		if err != nil {
			t.Fatalf("CreateCamera: %v", err)
		}
		uid, err := db.CreateUser(database, "viewer", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("CreateUser: %v", err)
		}
		if err := db.SetUserCameras(database, uid, []string{cam.ID}); err != nil {
			t.Fatalf("SetUserCameras: %v", err)
		}
		// Concessão órfã: simula uma câmera deletada antes do fix do T1 existir
		// (inserida direto, já que SetUserCameras hoje sempre substitui o set
		// inteiro do usuário).
		if _, err := database.Exec(
			`INSERT INTO user_settings(user_id, key, value) VALUES(?,?,?)`,
			uid, "camera:inexistente-nao-existe-mais", "1",
		); err != nil {
			t.Fatalf("insert orphan grant: %v", err)
		}

		sql, err := os.ReadFile(filepath.Join("migrations", "0052_cleanup_orphaned_camera_grants.sql"))
		if err != nil {
			t.Fatalf("read migration file: %v", err)
		}
		if _, err := database.Exec(string(sql)); err != nil {
			t.Fatalf("exec migration: %v", err)
		}

		cams, err := db.GetUserCameras(database, uid)
		if err != nil {
			t.Fatalf("GetUserCameras: %v", err)
		}
		if len(cams) != 1 || cams[0] != cam.ID {
			t.Errorf("esperava só a concessão válida [%s] após a limpeza, got %v", cam.ID, cams)
		}
	})
}
