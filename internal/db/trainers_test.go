package db_test

import (
	"testing"

	"camera/internal/db"
)

func TestTrainers(t *testing.T) {
	database := openTestDB(t)

	t.Run("CA2: cadastro de trainer com type e config chave-valor sobrevive create/list/get/update/delete", func(t *testing.T) {
		id, err := db.InsertTrainer(database, "YOLO principal", "yolo", map[string]string{
			"service_url": "http://yolo:8001",
		})
		if err != nil {
			t.Fatalf("InsertTrainer: %v", err)
		}

		list, err := db.ListTrainers(database)
		if err != nil {
			t.Fatalf("ListTrainers: %v", err)
		}
		if len(list) != 1 || list[0].Name != "YOLO principal" || list[0].Type != "yolo" {
			t.Fatalf("expected 1 trainer named YOLO principal (type yolo), got %+v", list)
		}

		got, err := db.GetTrainer(database, id)
		if err != nil {
			t.Fatalf("GetTrainer: %v", err)
		}
		if got.Type != "yolo" || got.Config["service_url"] != "http://yolo:8001" {
			t.Fatalf("unexpected trainer: %+v", got)
		}
		if got.CreatedAt.IsZero() {
			t.Fatalf("expected CreatedAt to be set, got zero value")
		}

		if err := db.UpdateTrainer(database, id, "YOLO principal v2", "yolo", map[string]string{
			"service_url": "http://yolo:9001",
		}); err != nil {
			t.Fatalf("UpdateTrainer: %v", err)
		}
		got, err = db.GetTrainer(database, id)
		if err != nil {
			t.Fatalf("GetTrainer after update: %v", err)
		}
		if got.Name != "YOLO principal v2" || got.Config["service_url"] != "http://yolo:9001" {
			t.Fatalf("update did not persist: %+v", got)
		}

		if err := db.DeleteTrainer(database, id); err != nil {
			t.Fatalf("DeleteTrainer: %v", err)
		}
		list, err = db.ListTrainers(database)
		if err != nil {
			t.Fatalf("ListTrainers after delete: %v", err)
		}
		if len(list) != 0 {
			t.Fatalf("expected empty list after delete, got %+v", list)
		}
	})
}
