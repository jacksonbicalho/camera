package db_test

import (
	"testing"

	"camera/internal/db"
)

func TestObjectDetectors(t *testing.T) {
	database := openTestDB(t)

	t.Run("CA2: cadastro de object detector com config chave-valor sobrevive create/list/get/update/delete", func(t *testing.T) {
		id, err := db.InsertObjectDetector(database, "YOLOv8-nano", map[string]string{
			"service_url":          "http://yolo:8001",
			"model":                "yolov8n",
			"confidence_threshold": "0.4",
		})
		if err != nil {
			t.Fatalf("InsertObjectDetector: %v", err)
		}

		list, err := db.ListObjectDetectors(database)
		if err != nil {
			t.Fatalf("ListObjectDetectors: %v", err)
		}
		if len(list) != 1 || list[0].Name != "YOLOv8-nano" {
			t.Fatalf("expected 1 detector named YOLOv8-nano, got %+v", list)
		}

		got, err := db.GetObjectDetector(database, id)
		if err != nil {
			t.Fatalf("GetObjectDetector: %v", err)
		}
		if got.Config["service_url"] != "http://yolo:8001" || got.Config["model"] != "yolov8n" {
			t.Fatalf("unexpected config: %+v", got.Config)
		}

		if err := db.UpdateObjectDetector(database, id, "YOLOv8-nano v2", map[string]string{
			"service_url":          "http://yolo:9001",
			"model":                "yolov8n",
			"confidence_threshold": "0.5",
		}); err != nil {
			t.Fatalf("UpdateObjectDetector: %v", err)
		}
		got, err = db.GetObjectDetector(database, id)
		if err != nil {
			t.Fatalf("GetObjectDetector after update: %v", err)
		}
		if got.Name != "YOLOv8-nano v2" || got.Config["service_url"] != "http://yolo:9001" {
			t.Fatalf("update did not persist: %+v", got)
		}

		if err := db.DeleteObjectDetector(database, id); err != nil {
			t.Fatalf("DeleteObjectDetector: %v", err)
		}
		list, err = db.ListObjectDetectors(database)
		if err != nil {
			t.Fatalf("ListObjectDetectors after delete: %v", err)
		}
		if len(list) != 0 {
			t.Fatalf("expected empty list after delete, got %+v", list)
		}
	})
}
