package db_test

import (
	"testing"

	"camera/internal/db"
)

func TestUserCameraMotionTelegramNotify(t *testing.T) {
	t.Run("CA2: sem configuração, opt-in vem desabilitado e score zero", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-notify-empty")

		enabled, minScore, err := db.GetUserCameraMotionTelegramNotify(database, id, "cam-1")
		if err != nil {
			t.Fatalf("GetUserCameraMotionTelegramNotify: %v", err)
		}
		if enabled {
			t.Error("expected enabled=false before any configuration")
		}
		if minScore != 0 {
			t.Errorf("expected min_score=0, got %v", minScore)
		}
	})

	t.Run("CA2: opt-in persiste e é lido de volta", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-notify-set")

		if err := db.SetUserCameraMotionTelegramNotify(database, id, "cam-1", true, 0.05); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify: %v", err)
		}
		enabled, minScore, err := db.GetUserCameraMotionTelegramNotify(database, id, "cam-1")
		if err != nil {
			t.Fatalf("GetUserCameraMotionTelegramNotify: %v", err)
		}
		if !enabled {
			t.Error("expected enabled=true after Set")
		}
		if minScore != 0.05 {
			t.Errorf("expected min_score=0.05, got %v", minScore)
		}
	})

	t.Run("CA2: opt-in é isolado por câmera, mesmo usuário", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-notify-per-camera")

		if err := db.SetUserCameraMotionTelegramNotify(database, id, "cam-1", true, 0.1); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify(cam-1): %v", err)
		}
		enabled, _, err := db.GetUserCameraMotionTelegramNotify(database, id, "cam-2")
		if err != nil {
			t.Fatalf("GetUserCameraMotionTelegramNotify(cam-2): %v", err)
		}
		if enabled {
			t.Error("expected cam-2 to remain unaffected by cam-1's opt-in")
		}
	})

	t.Run("CA2: desativar preserva o min_score já configurado", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-notify-disable")

		if err := db.SetUserCameraMotionTelegramNotify(database, id, "cam-1", true, 0.2); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify(enable): %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, id, "cam-1", false, 0.2); err != nil {
			t.Fatalf("SetUserCameraMotionTelegramNotify(disable): %v", err)
		}
		enabled, minScore, err := db.GetUserCameraMotionTelegramNotify(database, id, "cam-1")
		if err != nil {
			t.Fatalf("GetUserCameraMotionTelegramNotify: %v", err)
		}
		if enabled {
			t.Error("expected enabled=false after disabling")
		}
		if minScore != 0.2 {
			t.Errorf("expected min_score to be preserved at 0.2, got %v", minScore)
		}
	})
}

func TestUserHasAnyCameraMotionTelegramNotifyEnabled(t *testing.T) {
	t.Run("CA2: sem nenhum opt-in configurado, devolve false", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-any-empty")

		has, err := db.UserHasAnyCameraMotionTelegramNotifyEnabled(database, id)
		if err != nil {
			t.Fatalf("UserHasAnyCameraMotionTelegramNotifyEnabled: %v", err)
		}
		if has {
			t.Error("expected false sem nenhuma câmera configurada")
		}
	})

	t.Run("CA2: opt-in desabilitado em todas as câmeras configuradas devolve false", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-any-disabled")

		if err := db.SetUserCameraMotionTelegramNotify(database, id, "cam-1", false, 0.1); err != nil {
			t.Fatalf("Set cam-1: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, id, "cam-2", false, 0.1); err != nil {
			t.Fatalf("Set cam-2: %v", err)
		}

		has, err := db.UserHasAnyCameraMotionTelegramNotifyEnabled(database, id)
		if err != nil {
			t.Fatalf("UserHasAnyCameraMotionTelegramNotifyEnabled: %v", err)
		}
		if has {
			t.Error("expected false quando todas as câmeras configuradas estão desabilitadas")
		}
	})

	t.Run("CA2: devolve true quando pelo menos 1 câmera está habilitada", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-any-enabled")

		if err := db.SetUserCameraMotionTelegramNotify(database, id, "cam-1", false, 0.1); err != nil {
			t.Fatalf("Set cam-1: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, id, "cam-2", true, 0.05); err != nil {
			t.Fatalf("Set cam-2: %v", err)
		}

		has, err := db.UserHasAnyCameraMotionTelegramNotifyEnabled(database, id)
		if err != nil {
			t.Fatalf("UserHasAnyCameraMotionTelegramNotifyEnabled: %v", err)
		}
		if !has {
			t.Error("expected true com cam-2 habilitada")
		}
	})

	t.Run("CA2: opt-in de outro usuário não afeta o resultado", func(t *testing.T) {
		database := openTestDB(t)
		id := mkUser(t, database, "telegram-any-isolated")
		other := mkUser(t, database, "telegram-any-other")

		if err := db.SetUserCameraMotionTelegramNotify(database, other, "cam-1", true, 0.1); err != nil {
			t.Fatalf("Set other: %v", err)
		}

		has, err := db.UserHasAnyCameraMotionTelegramNotifyEnabled(database, id)
		if err != nil {
			t.Fatalf("UserHasAnyCameraMotionTelegramNotifyEnabled: %v", err)
		}
		if has {
			t.Error("expected false — opt-in habilitado é de outro usuário")
		}
	})
}

func TestListCameraMotionTelegramNotifyPrefs(t *testing.T) {
	t.Run("CA2: lista todos os usuários com opt-in configurado para a câmera, ignorando outras câmeras", func(t *testing.T) {
		database := openTestDB(t)
		u1 := mkUser(t, database, "telegram-notify-list-1")
		u2 := mkUser(t, database, "telegram-notify-list-2")
		u3 := mkUser(t, database, "telegram-notify-list-3")

		if err := db.SetUserCameraMotionTelegramNotify(database, u1, "cam-1", true, 0.05); err != nil {
			t.Fatalf("Set u1: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, u2, "cam-1", false, 0.1); err != nil {
			t.Fatalf("Set u2: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, u3, "cam-2", true, 0.02); err != nil {
			t.Fatalf("Set u3 (outra câmera): %v", err)
		}

		prefs, err := db.ListCameraMotionTelegramNotifyPrefs(database, "cam-1")
		if err != nil {
			t.Fatalf("ListCameraMotionTelegramNotifyPrefs: %v", err)
		}
		if len(prefs) != 2 {
			t.Fatalf("expected 2 prefs for cam-1, got %d: %+v", len(prefs), prefs)
		}
		byUser := map[int64]db.CameraMotionTelegramNotifyPref{}
		for _, p := range prefs {
			byUser[p.UserID] = p
		}
		if p, ok := byUser[u1]; !ok || !p.Enabled || p.MinScore != 0.05 {
			t.Errorf("expected u1 pref enabled=true min_score=0.05, got %+v (ok=%v)", p, ok)
		}
		if p, ok := byUser[u2]; !ok || p.Enabled || p.MinScore != 0.1 {
			t.Errorf("expected u2 pref enabled=false min_score=0.1, got %+v (ok=%v)", p, ok)
		}
		if _, ok := byUser[u3]; ok {
			t.Error("expected u3 (cam-2) to not appear in cam-1's list")
		}
	})

	t.Run("CA2: câmera sem nenhum opt-in configurado devolve lista vazia", func(t *testing.T) {
		database := openTestDB(t)
		prefs, err := db.ListCameraMotionTelegramNotifyPrefs(database, "cam-empty")
		if err != nil {
			t.Fatalf("ListCameraMotionTelegramNotifyPrefs: %v", err)
		}
		if len(prefs) != 0 {
			t.Errorf("expected empty list, got %+v", prefs)
		}
	})
}
