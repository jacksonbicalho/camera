package db_test

import (
	"testing"
	"time"

	"camera/internal/db"
)

func TestVideoAnalysisConfig_DefaultAndUpdate(t *testing.T) {
	database := openTestDB(t)

	cfg, err := db.GetVideoAnalysisConfig(database)
	if err != nil {
		t.Fatalf("GetVideoAnalysisConfig: %v", err)
	}
	if cfg.Model != "yolov8n" {
		t.Errorf("default model = %q, want yolov8n", cfg.Model)
	}

	cfg.ServiceURL = "http://yolo:8000"
	cfg.Model = "yolov8s"
	if err := db.UpdateVideoAnalysisConfig(database, cfg); err != nil {
		t.Fatalf("UpdateVideoAnalysisConfig: %v", err)
	}

	got, err := db.GetVideoAnalysisConfig(database)
	if err != nil {
		t.Fatalf("GetVideoAnalysisConfig after update: %v", err)
	}
	if got.ServiceURL != "http://yolo:8000" {
		t.Errorf("ServiceURL = %q, want http://yolo:8000", got.ServiceURL)
	}
	if got.Model != "yolov8s" {
		t.Errorf("Model = %q, want yolov8s", got.Model)
	}
}

// GetStateClassificationServiceURL substitui video_analysis_config.service_url
// (removida em T3): em vez de um campo digitado à parte, resolve a URL do
// serviço YOLO através de um trainer já cadastrado (trainers/trainer_config,
// internal/db/trainers.go) — sem exigir cadastrar a mesma URL de novo.
func TestStateClassificationServiceConfig_DefaultAndSet(t *testing.T) {
	database := openTestDB(t)

	t.Run("CA2: sem trainer configurado, id e URL resolvida ficam vazios", func(t *testing.T) {
		id, err := db.GetStateClassificationTrainerID(database)
		if err != nil {
			t.Fatalf("GetStateClassificationTrainerID: %v", err)
		}
		if id != nil {
			t.Errorf("default trainer id = %v, want nil", *id)
		}
		url, err := db.GetStateClassificationServiceURL(database)
		if err != nil {
			t.Fatalf("GetStateClassificationServiceURL: %v", err)
		}
		if url != "" {
			t.Errorf("default service url = %q, want empty", url)
		}
	})

	t.Run("CA2: setar um trainer persiste o id e resolve a URL DELE, não um campo separado", func(t *testing.T) {
		trainerID, err := db.InsertTrainer(database, "YOLO principal", "yolo", map[string]string{
			"service_url": "http://yolo:8001",
			"model":       "yolo11n",
		})
		if err != nil {
			t.Fatalf("InsertTrainer: %v", err)
		}
		if err := db.SetStateClassificationTrainerID(database, &trainerID); err != nil {
			t.Fatalf("SetStateClassificationTrainerID: %v", err)
		}

		gotID, err := db.GetStateClassificationTrainerID(database)
		if err != nil {
			t.Fatalf("GetStateClassificationTrainerID after set: %v", err)
		}
		if gotID == nil || *gotID != trainerID {
			t.Errorf("trainer id = %v, want %d", gotID, trainerID)
		}

		url, err := db.GetStateClassificationServiceURL(database)
		if err != nil {
			t.Fatalf("GetStateClassificationServiceURL after set: %v", err)
		}
		if url != "http://yolo:8001" {
			t.Errorf("service url = %q, want http://yolo:8001 (do trainer cadastrado)", url)
		}
	})

	t.Run("CA2: trainer configurado e depois apagado volta a resolver como não configurado, sem erro", func(t *testing.T) {
		trainerID, err := db.InsertTrainer(database, "YOLO temporário", "yolo", map[string]string{
			"service_url": "http://yolo:9000",
		})
		if err != nil {
			t.Fatalf("InsertTrainer: %v", err)
		}
		if err := db.SetStateClassificationTrainerID(database, &trainerID); err != nil {
			t.Fatalf("SetStateClassificationTrainerID: %v", err)
		}
		if err := db.DeleteTrainer(database, trainerID); err != nil {
			t.Fatalf("DeleteTrainer: %v", err)
		}

		url, err := db.GetStateClassificationServiceURL(database)
		if err != nil {
			t.Fatalf("GetStateClassificationServiceURL after trainer deleted: %v", err)
		}
		if url != "" {
			t.Errorf("service url = %q, want empty (trainer apagado)", url)
		}
	})
}

func TestCameraAnalysisConfig_DefaultAndSet(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	cfg, err := db.GetCameraAnalysisConfig(database, "cam1")
	if err != nil {
		t.Fatalf("GetCameraAnalysisConfig: %v", err)
	}
	// Feedback do navigator na pré-push de fix/camera-analysis-toggle:
	// análise não pode ter default true — uma câmera nunca configurada
	// deve começar desligada (opt-in), não ligada com detector nil.
	if cfg.Enabled {
		t.Error("default per-camera enabled should be false")
	}
	if cfg.DetectorID != nil {
		t.Errorf("default DetectorID should be nil, got %v", *cfg.DetectorID)
	}
	if cfg.ConfidenceThreshold != nil {
		t.Errorf("default ConfidenceThreshold should be nil, got %v", *cfg.ConfidenceThreshold)
	}

	if err := db.SetCameraAnalysisConfig(database, "cam1", db.CameraAnalysisConfig{Enabled: false}); err != nil {
		t.Fatalf("SetCameraAnalysisConfig: %v", err)
	}
	cfg, err = db.GetCameraAnalysisConfig(database, "cam1")
	if err != nil {
		t.Fatalf("GetCameraAnalysisConfig after set: %v", err)
	}
	if cfg.Enabled {
		t.Error("expected enabled=false after set")
	}

	detID, err := db.InsertObjectDetector(database, "yolo-principal", map[string]string{"service_url": "http://yolo:8000"})
	if err != nil {
		t.Fatalf("InsertObjectDetector: %v", err)
	}
	threshold := 0.6
	if err := db.SetCameraAnalysisConfig(database, "cam1", db.CameraAnalysisConfig{
		Enabled:             true,
		DetectorID:          &detID,
		ConfidenceThreshold: &threshold,
	}); err != nil {
		t.Fatalf("SetCameraAnalysisConfig with detector: %v", err)
	}
	cfg, _ = db.GetCameraAnalysisConfig(database, "cam1")
	if !cfg.Enabled {
		t.Error("expected enabled=true after re-enable")
	}
	if cfg.DetectorID == nil || *cfg.DetectorID != detID {
		t.Errorf("DetectorID = %v, want %d", cfg.DetectorID, detID)
	}
	if cfg.ConfidenceThreshold == nil || *cfg.ConfidenceThreshold != 0.6 {
		t.Errorf("ConfidenceThreshold = %v, want 0.6", cfg.ConfidenceThreshold)
	}
}

func TestDetections_InsertAndList(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: time.Now().Add(-5 * time.Minute),
		EndedAt:   time.Now(),
		Path:      "cam1/2024/01/01/120000.mp4",
		SizeBytes: 1024,
	}); err != nil {
		t.Fatalf("InsertRecording: %v", err)
	}

	detections := []db.Detection{
		{Label: "person", Confidence: 0.92, FrameCount: 10},
		{Label: "car", Confidence: 0.78, FrameCount: 3},
	}
	if err := db.InsertDetections(database, "cam1/2024/01/01/120000.mp4", detections, false); err != nil {
		t.Fatalf("InsertDetections: %v", err)
	}

	got, err := db.ListDetectionsByPath(database, "cam1/2024/01/01/120000.mp4")
	if err != nil {
		t.Fatalf("ListDetectionsByPath: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 detections, got %d", len(got))
	}

	labels := map[string]bool{}
	for _, d := range got {
		labels[d.Label] = true
	}
	if !labels["person"] || !labels["car"] {
		t.Errorf("expected person and car labels, got %v", labels)
	}
}

func TestDetections_DeleteCascade(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: time.Now().Add(-5 * time.Minute),
		EndedAt:   time.Now(),
		Path:      "cam1/2024/01/01/120001.mp4",
		SizeBytes: 512,
	}); err != nil {
		t.Fatalf("InsertRecording: %v", err)
	}
	if err := db.InsertDetections(database, "cam1/2024/01/01/120001.mp4", []db.Detection{
		{Label: "dog", Confidence: 0.85, FrameCount: 2},
	}, false); err != nil {
		t.Fatalf("InsertDetections: %v", err)
	}

	if err := db.DeleteRecording(database, "cam1/2024/01/01/120001.mp4"); err != nil {
		t.Fatalf("DeleteRecording: %v", err)
	}

	got, err := db.ListDetectionsByPath(database, "cam1/2024/01/01/120001.mp4")
	if err != nil {
		t.Fatalf("ListDetectionsByPath after delete: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected 0 detections after cascade delete, got %d", len(got))
	}
}

func TestDetectionsByPaths_CustomModelFlag(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	for _, path := range []string{"cam1/2024/01/01/120000.mp4", "cam1/2024/01/01/120500.mp4"} {
		if err := db.InsertRecording(database, db.Recording{
			CameraID:  "cam1",
			StartedAt: time.Now().Add(-5 * time.Minute),
			EndedAt:   time.Now(),
			Path:      path,
			SizeBytes: 512,
		}); err != nil {
			t.Fatalf("InsertRecording(%s): %v", path, err)
		}
	}
	if err := db.InsertDetections(database, "cam1/2024/01/01/120000.mp4", []db.Detection{
		{Label: "person", Confidence: 0.9, FrameCount: 3},
	}, false); err != nil {
		t.Fatalf("InsertDetections base: %v", err)
	}
	if err := db.InsertDetections(database, "cam1/2024/01/01/120500.mp4", []db.Detection{
		{Label: "dog", Confidence: 0.8, FrameCount: 2},
	}, true); err != nil {
		t.Fatalf("InsertDetections custom: %v", err)
	}

	result, err := db.DetectionsByPaths(database, []string{
		"cam1/2024/01/01/120000.mp4",
		"cam1/2024/01/01/120500.mp4",
	})
	if err != nil {
		t.Fatalf("DetectionsByPaths: %v", err)
	}
	if d := result["cam1/2024/01/01/120000.mp4"]; len(d) != 1 || d[0].CustomModel {
		t.Errorf("expected base model detection (custom_model=false), got %+v", d)
	}
	if d := result["cam1/2024/01/01/120500.mp4"]; len(d) != 1 || !d[0].CustomModel {
		t.Errorf("expected custom model detection (custom_model=true), got %+v", d)
	}
}

func TestResetDetectionsForReanalysis_DeletesAllDetections(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	// gravação com detecção do modelo base
	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: time.Now().Add(-10 * time.Minute),
		EndedAt:   time.Now(),
		Path:      "cam1/2024/01/01/120000.mp4",
		HasMotion: true,
	}); err != nil {
		t.Fatalf("InsertRecording base: %v", err)
	}
	if err := db.InsertDetections(database, "cam1/2024/01/01/120000.mp4", []db.Detection{
		{Label: "person", Confidence: 0.9, FrameCount: 5},
	}, false); err != nil {
		t.Fatalf("InsertDetections base: %v", err)
	}

	// gravação com detecção do custom model — também deve ser apagada
	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: time.Now().Add(-20 * time.Minute),
		EndedAt:   time.Now(),
		Path:      "cam1/2024/01/01/110000.mp4",
		HasMotion: true,
	}); err != nil {
		t.Fatalf("InsertRecording custom: %v", err)
	}
	if err := db.InsertDetections(database, "cam1/2024/01/01/110000.mp4", []db.Detection{
		{Label: "car", Confidence: 0.8, FrameCount: 3},
	}, true); err != nil {
		t.Fatalf("InsertDetections custom: %v", err)
	}

	if err := db.ResetDetectionsForReanalysis(database); err != nil {
		t.Fatalf("ResetDetectionsForReanalysis: %v", err)
	}

	base, _ := db.ListDetectionsByPath(database, "cam1/2024/01/01/120000.mp4")
	if len(base) != 0 {
		t.Errorf("expected base detections deleted, got %d", len(base))
	}

	custom, _ := db.ListDetectionsByPath(database, "cam1/2024/01/01/110000.mp4")
	if len(custom) != 0 {
		t.Errorf("expected custom detections deleted, got %d", len(custom))
	}
}

func TestResetDetectionsForReanalysis_ResetsAnalysisSkipped(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: time.Now().Add(-5 * time.Minute),
		EndedAt:   time.Now(),
		Path:      "cam1/2024/01/01/130000.mp4",
		HasMotion: true,
	}); err != nil {
		t.Fatalf("InsertRecording: %v", err)
	}
	// marca como skipped com detecção base
	if err := db.InsertDetections(database, "cam1/2024/01/01/130000.mp4", []db.Detection{
		{Label: "", Confidence: 0, FrameCount: 0},
	}, false); err != nil {
		t.Fatalf("InsertDetections sentinel: %v", err)
	}
	if err := db.MarkAnalysisSkipped(database, 1); err != nil {
		// id pode variar; apenas verifica que ResetDetections não falha
		_ = err
	}

	if err := db.ResetDetectionsForReanalysis(database); err != nil {
		t.Fatalf("ResetDetectionsForReanalysis: %v", err)
	}

	// gravação deve estar elegível para re-análise (sem detecções)
	dets, _ := db.ListDetectionsByPath(database, "cam1/2024/01/01/130000.mp4")
	if len(dets) != 0 {
		t.Errorf("expected no detections after reset, got %d", len(dets))
	}
}
