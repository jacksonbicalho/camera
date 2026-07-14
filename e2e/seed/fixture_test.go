package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/db"
)

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	dir := t.TempDir()
	database, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func writeFile(path, content string) error {
	return os.WriteFile(path, []byte(content), 0o644)
}

func cameraConfigFixture(id string) config.CameraConfig {
	return config.CameraConfig{
		ID:              id,
		Name:            "Test Cam",
		RTSPURL:         "rtsp://fixture/" + id,
		VideoCodec:      "h264",
		HLSVideoMode:    "auto",
		RecordVideoMode: "copy",
	}
}

func TestLoadFixture_ParsesYAML(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "fixture.yaml")
	content := `
users:
  - username: admin
    password: adminpass
    role: admin
  - username: viewer1
    password: viewerpass
    role: viewer
    cameras: ["cam-a"]
cameras:
  - id: cam-a
    name: Camera A
    rtsp_url: rtsp://fixture/a
    video_codec: h264
    recordings: 3
    events:
      - recording_index: 1
        offset_seconds: 10
        score: 0.8
        label: person
        bbox_x: 0.1
        bbox_y: 0.2
        bbox_w: 0.3
        bbox_h: 0.4
`
	if err := writeFile(path, content); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	f, err := loadFixture(path)
	if err != nil {
		t.Fatalf("loadFixture: %v", err)
	}

	if len(f.Users) != 2 || f.Users[1].Username != "viewer1" || f.Users[1].Cameras[0] != "cam-a" {
		t.Fatalf("unexpected users: %+v", f.Users)
	}
	if len(f.Cameras) != 1 || f.Cameras[0].ID != "cam-a" || f.Cameras[0].Recordings != 3 {
		t.Fatalf("unexpected cameras: %+v", f.Cameras)
	}
	if len(f.Cameras[0].Events) != 1 || f.Cameras[0].Events[0].Label != "person" {
		t.Fatalf("unexpected events: %+v", f.Cameras[0].Events)
	}
}

func TestApplyFixture_UsersAndCameraAccess(t *testing.T) {
	database := openTestDB(t)

	f := defaultFixture("admin", "adminpass", "cam-1", "cam-2", "viewer", "viewerpass", 0)
	info, err := applyFixture(database, t.TempDir(), f)
	if err != nil {
		t.Fatalf("applyFixture: %v", err)
	}

	if info.AdminUser != "admin" || info.ViewerUser != "viewer" {
		t.Fatalf("unexpected info: %+v", info)
	}
	if info.CameraID != "cam-1" || info.AdminOnlyCameraID != "cam-2" {
		t.Fatalf("unexpected camera ids: %+v", info)
	}

	viewer, err := db.GetUserByUsername(database, "viewer")
	if err != nil {
		t.Fatalf("GetUserByUsername: %v", err)
	}
	has1, err := db.UserHasCamera(database, viewer.ID, "cam-1")
	if err != nil || !has1 {
		t.Fatalf("expected viewer to have access to cam-1: has=%v err=%v", has1, err)
	}
	has2, err := db.UserHasCamera(database, viewer.ID, "cam-2")
	if err != nil || has2 {
		t.Fatalf("expected viewer to NOT have access to cam-2 (admin-only): has=%v err=%v", has2, err)
	}
}

func TestApplyFixture_MotionEvents(t *testing.T) {
	database := openTestDB(t)

	f := Fixture{
		Users: []FixtureUser{{Username: "admin", Password: "adminpass", Role: "admin"}},
		Cameras: []FixtureCamera{
			{
				CameraConfig: cameraConfigFixture("cam-1"),
				Recordings:   3,
				Events: []FixtureMotionEvent{
					{RecordingIndex: 1, OffsetSeconds: 10, Score: 0.8, Label: "person", BboxX: 0.1, BboxY: 0.2, BboxW: 0.3, BboxH: 0.4},
				},
			},
		},
	}

	if _, err := applyFixture(database, t.TempDir(), f); err != nil {
		t.Fatalf("applyFixture: %v", err)
	}

	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM motion_events WHERE camera_id = ?`, "cam-1").Scan(&count); err != nil {
		t.Fatalf("count motion_events: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 motion event, got %d", count)
	}

	var label string
	var occurredAtRaw string
	if err := database.QueryRow(`SELECT label, occurred_at FROM motion_events WHERE camera_id = ?`, "cam-1").Scan(&label, &occurredAtRaw); err != nil {
		t.Fatalf("read motion event: %v", err)
	}
	if label != "person" {
		t.Fatalf("expected label 'person', got %q", label)
	}
	occurredAt, err := time.Parse(time.RFC3339, occurredAtRaw)
	if err != nil {
		t.Fatalf("occurred_at not RFC3339: %v (%q)", err, occurredAtRaw)
	}

	// O evento referencia recording_index=1 (2ª gravação, 0-based, ordem
	// cronológica) + offset_seconds=10 — confirma que o cálculo bate com o
	// started_at REAL da gravação, não só que occurred_at tem formato válido.
	var recordingStartedAtRaw string
	err = database.QueryRow(
		`SELECT started_at FROM recordings WHERE camera_id = ? ORDER BY started_at ASC LIMIT 1 OFFSET 1`,
		"cam-1",
	).Scan(&recordingStartedAtRaw)
	if err != nil {
		t.Fatalf("read 2ª gravação: %v", err)
	}
	recordingStartedAt, err := time.Parse(time.RFC3339, recordingStartedAtRaw)
	if err != nil {
		t.Fatalf("started_at not RFC3339: %v (%q)", err, recordingStartedAtRaw)
	}

	want := recordingStartedAt.Add(10 * time.Second)
	if !occurredAt.Equal(want) {
		t.Fatalf("occurred_at = %v, want %v (started_at %v + 10s)", occurredAt, want, recordingStartedAt)
	}
}

func TestApplyFixture_EventRecordingIndexOutOfRange(t *testing.T) {
	cases := []struct {
		name           string
		recordingIndex int
	}{
		{"acima do range", 5},
		{"negativo", -1},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			database := openTestDB(t)

			f := Fixture{
				Users: []FixtureUser{{Username: "admin", Password: "adminpass", Role: "admin"}},
				Cameras: []FixtureCamera{
					{
						CameraConfig: cameraConfigFixture("cam-1"),
						Recordings:   1,
						Events:       []FixtureMotionEvent{{RecordingIndex: tc.recordingIndex}},
					},
				},
			}

			if _, err := applyFixture(database, t.TempDir(), f); err == nil {
				t.Fatalf("expected error for recording_index=%d, got nil", tc.recordingIndex)
			}
		})
	}
}
