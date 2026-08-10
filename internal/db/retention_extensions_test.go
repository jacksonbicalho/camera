package db_test

import (
	"testing"

	"camera/internal/db"
)

func TestRetentionExtensions_CreateListDelete(t *testing.T) {
	database := openTestDB(t)

	list, err := db.ListRetentionExtensions(database)
	if err != nil {
		t.Fatalf("ListRetentionExtensions: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("expected 0 retention extensions, got %d", len(list))
	}

	created, err := db.InsertRetentionExtension(database, db.RetentionExtension{
		Name:      "my-s3",
		Type:      "s3",
		Bucket:    "my-bucket",
		Region:    "us-east-1",
		AccessKey: "AKID",
		SecretKey: "SECRET",
	})
	if err != nil {
		t.Fatalf("InsertRetentionExtension: %v", err)
	}
	if created.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if created.Name != "my-s3" {
		t.Errorf("Name = %q, want %q", created.Name, "my-s3")
	}

	list, err = db.ListRetentionExtensions(database)
	if err != nil {
		t.Fatalf("ListRetentionExtensions: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 retention extension, got %d", len(list))
	}

	if err := db.DeleteRetentionExtension(database, created.ID); err != nil {
		t.Fatalf("DeleteRetentionExtension: %v", err)
	}
	list, _ = db.ListRetentionExtensions(database)
	if len(list) != 0 {
		t.Fatalf("expected 0 retention extensions after delete, got %d", len(list))
	}
}

func TestRetentionExtensions_Update(t *testing.T) {
	database := openTestDB(t)

	re, err := db.InsertRetentionExtension(database, db.RetentionExtension{
		Name:      "test",
		Type:      "s3",
		Bucket:    "bucket1",
		AccessKey: "AK",
		SecretKey: "SK",
	})
	if err != nil {
		t.Fatalf("InsertRetentionExtension: %v", err)
	}

	re.Bucket = "bucket2"
	re.Prefix = "archive/"
	if err := db.UpdateRetentionExtension(database, re); err != nil {
		t.Fatalf("UpdateRetentionExtension: %v", err)
	}

	got, err := db.GetRetentionExtension(database, re.ID)
	if err != nil {
		t.Fatalf("GetRetentionExtension: %v", err)
	}
	if got.Bucket != "bucket2" {
		t.Errorf("Bucket = %q, want %q", got.Bucket, "bucket2")
	}
	if got.Prefix != "archive/" {
		t.Errorf("Prefix = %q, want %q", got.Prefix, "archive/")
	}
}

// CA4 (nível DB): HasRetentionExtension reflete corretamente 0/1 linha —
// usado pelo server pra rejeitar (409) uma 2ª criação, já que S3 é singleton.
func TestHasRetentionExtension(t *testing.T) {
	t.Run("CA4: HasRetentionExtension reporta false sem nenhuma linha e true após inserir uma", func(t *testing.T) {
		database := openTestDB(t)

		has, err := db.HasRetentionExtension(database)
		if err != nil {
			t.Fatal(err)
		}
		if has {
			t.Error("expected false with no retention extension configured")
		}

		re, err := db.InsertRetentionExtension(database, db.RetentionExtension{
			Name: "s3", Type: "s3", Bucket: "b", AccessKey: "AK", SecretKey: "SK",
		})
		if err != nil {
			t.Fatal(err)
		}

		has, err = db.HasRetentionExtension(database)
		if err != nil {
			t.Fatal(err)
		}
		if !has {
			t.Error("expected true after inserting a retention extension")
		}

		if err := db.DeleteRetentionExtension(database, re.ID); err != nil {
			t.Fatal(err)
		}
		has, err = db.HasRetentionExtension(database)
		if err != nil {
			t.Fatal(err)
		}
		if has {
			t.Error("expected false after deleting the only retention extension")
		}
	})
}

func TestRetentionConfig_DefaultsAndUpdate(t *testing.T) {
	database := openTestDB(t)

	configs, err := db.ListRetentionConfigs(database)
	if err != nil {
		t.Fatalf("ListRetentionConfigs: %v", err)
	}
	if len(configs) != 2 {
		t.Fatalf("expected 2 default configs, got %d", len(configs))
	}
	for _, rc := range configs {
		if rc.Action != "delete" {
			t.Errorf("category %q: default action = %q, want %q", rc.Category, rc.Action, "delete")
		}
	}

	re, _ := db.InsertRetentionExtension(database, db.RetentionExtension{
		Name: "s3", Type: "s3", Bucket: "b", AccessKey: "AK", SecretKey: "SK",
	})

	if err := db.UpdateRetentionConfig(database, db.RetentionConfig{
		Category:             "without_motion",
		Action:               "send_to_drive",
		RetentionExtensionID: re.ID,
	}); err != nil {
		t.Fatalf("UpdateRetentionConfig: %v", err)
	}

	configs, _ = db.ListRetentionConfigs(database)
	for _, rc := range configs {
		if rc.Category == "without_motion" {
			if rc.Action != "send_to_drive" {
				t.Errorf("action = %q, want send_to_drive", rc.Action)
			}
			if rc.RetentionExtensionID != re.ID {
				t.Errorf("retention_extension_id = %q, want %q", rc.RetentionExtensionID, re.ID)
			}
		}
	}
}
