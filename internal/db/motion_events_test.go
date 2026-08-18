package db_test

import (
	"testing"
	"time"

	"camera/internal/db"
)

func ensureCamera(t *testing.T, database *db.DB, id string) {
	t.Helper()
	c := makeCamera(id)
	c.ID = id
	if _, err := db.CreateCamera(database, c, nil); err != nil {
		t.Fatalf("CreateCamera(%s): %v", id, err)
	}
}

func insertTestEvent(t *testing.T, database *db.DB, cameraID string, occurredAt time.Time, score float64, color string) {
	t.Helper()
	ev := db.MotionEvent{
		CameraID:   cameraID,
		OccurredAt: occurredAt,
		Score:      score,
		Color:      color,
	}
	if err := db.InsertMotionEvent(database, ev); err != nil {
		t.Fatalf("InsertMotionEvent: %v", err)
	}
}

func TestInsertMotionEventReturningID(t *testing.T) {
	t.Run("CA9: devolve o id da linha inserida, distinto entre inserções", func(t *testing.T) {
		database := openTestDB(t)
		ensureCamera(t, database, "cam1")

		id1, err := db.InsertMotionEventReturningID(database, db.MotionEvent{
			CameraID: "cam1", OccurredAt: time.Now(), Score: 0.5,
		})
		if err != nil {
			t.Fatalf("InsertMotionEventReturningID: %v", err)
		}
		if id1 <= 0 {
			t.Fatalf("expected a positive id, got %d", id1)
		}
		id2, err := db.InsertMotionEventReturningID(database, db.MotionEvent{
			CameraID: "cam1", OccurredAt: time.Now(), Score: 0.6,
		})
		if err != nil {
			t.Fatalf("InsertMotionEventReturningID: %v", err)
		}
		if id2 == id1 {
			t.Fatalf("expected distinct ids, got %d twice", id1)
		}
	})
}

func TestListMotionEvents_ReturnsEventsInRange(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	base := time.Date(2026, 5, 3, 10, 0, 0, 0, time.UTC)
	insertTestEvent(t, database, "cam1", base, 0.5, "#ff0000")
	insertTestEvent(t, database, "cam1", base.Add(5*time.Second), 0.8, "#00ff00")
	insertTestEvent(t, database, "cam1", base.Add(24*time.Hour), 0.3, "") // dia seguinte — fora do range

	start := base
	end := base.Add(24 * time.Hour)
	events, err := db.ListMotionEvents(database, "cam1", start, end)
	if err != nil {
		t.Fatalf("ListMotionEvents: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 events, got %d", len(events))
	}
	if events[0].Score != 0.5 {
		t.Errorf("expected score 0.5, got %f", events[0].Score)
	}
	if events[0].Color != "#ff0000" {
		t.Errorf("expected color #ff0000, got %q", events[0].Color)
	}
	if events[1].Score != 0.8 {
		t.Errorf("expected score 0.8, got %f", events[1].Score)
	}
}

func TestListMotionEvents_ExcludesOtherCameras(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")
	ensureCamera(t, database, "cam2")

	base := time.Date(2026, 5, 3, 10, 0, 0, 0, time.UTC)
	insertTestEvent(t, database, "cam1", base, 0.5, "")
	insertTestEvent(t, database, "cam2", base, 0.9, "")

	events, err := db.ListMotionEvents(database, "cam1", base, base.Add(time.Hour))
	if err != nil {
		t.Fatalf("ListMotionEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event for cam1, got %d", len(events))
	}
}

func TestListMotionEvents_ReturnsEmptyWhenNone(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	base := time.Date(2026, 5, 3, 10, 0, 0, 0, time.UTC)
	events, err := db.ListMotionEvents(database, "cam1", base, base.Add(time.Hour))
	if err != nil {
		t.Fatalf("ListMotionEvents: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("expected 0 events, got %d", len(events))
	}
}

func TestMinMaxScoreForDay_ReturnsCorrectValues(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	base := time.Date(2026, 5, 3, 10, 0, 0, 0, time.UTC)
	insertTestEvent(t, database, "cam1", base, 0.5, "")
	insertTestEvent(t, database, "cam1", base.Add(5*time.Minute), 0.9, "")
	insertTestEvent(t, database, "cam1", base.Add(10*time.Minute), 0.3, "")

	start := time.Date(2026, 5, 3, 0, 0, 0, 0, time.UTC)
	end := start.Add(24 * time.Hour)
	mn, mx, err := db.MinMaxScoreForDay(database, "cam1", start, end)
	if err != nil {
		t.Fatalf("MinMaxScoreForDay: %v", err)
	}
	if mn != 0.3 {
		t.Errorf("expected min=0.3, got %f", mn)
	}
	if mx != 0.9 {
		t.Errorf("expected max=0.9, got %f", mx)
	}
}

func TestMinMaxScoreForDay_ReturnsZerosWhenEmpty(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	start := time.Date(2026, 5, 3, 0, 0, 0, 0, time.UTC)
	end := start.Add(24 * time.Hour)
	mn, mx, err := db.MinMaxScoreForDay(database, "cam1", start, end)
	if err != nil {
		t.Fatalf("MinMaxScoreForDay: %v", err)
	}
	if mn != 0 || mx != 0 {
		t.Errorf("expected 0,0 for empty, got %f,%f", mn, mx)
	}
}

func TestInsertMotionEvent_PersistsColor(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	base := time.Date(2026, 5, 3, 10, 0, 0, 0, time.UTC)
	insertTestEvent(t, database, "cam1", base, 0.5, "#3b82f6")

	events, err := db.ListMotionEvents(database, "cam1", base, base.Add(time.Second))
	if err != nil {
		t.Fatalf("ListMotionEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Color != "#3b82f6" {
		t.Errorf("expected color #3b82f6, got %q", events[0].Color)
	}
}

func TestBulkDeleteMotionEvents_DeletesAndReturnsFramePaths(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	base := time.Date(2026, 5, 3, 10, 0, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		ev := db.MotionEvent{
			CameraID:   "cam1",
			OccurredAt: base.Add(time.Duration(i) * time.Second),
			Score:      0.5,
			FramePath:  "frame_" + time.Duration(i).String() + ".jpg",
		}
		if err := db.InsertMotionEvent(database, ev); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}

	events, err := db.ListMotionEvents(database, "cam1", base.Add(-time.Minute), base.Add(time.Hour))
	if err != nil {
		t.Fatalf("ListMotionEvents: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d", len(events))
	}
	ids := []int64{events[0].ID, events[1].ID}

	deleted, snaps, err := db.BulkDeleteMotionEvents(database, ids)
	if err != nil {
		t.Fatalf("BulkDeleteMotionEvents: %v", err)
	}
	if deleted != 2 {
		t.Errorf("expected deleted=2, got %d", deleted)
	}
	if len(snaps) != 2 {
		t.Errorf("expected 2 snapshots, got %d", len(snaps))
	}
	for _, sn := range snaps {
		if sn.CameraID != "cam1" || sn.FramePath == "" {
			t.Errorf("missing fields in snapshot: %+v", sn)
		}
	}

	remaining, err := db.ListMotionEvents(database, "cam1", base.Add(-time.Minute), base.Add(time.Hour))
	if err != nil {
		t.Fatalf("ListMotionEvents: %v", err)
	}
	if len(remaining) != 1 {
		t.Errorf("expected 1 remaining, got %d", len(remaining))
	}
}

func TestBulkDeleteMotionEvents_EmptyIDsReturnsZero(t *testing.T) {
	database := openTestDB(t)
	deleted, snaps, err := db.BulkDeleteMotionEvents(database, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if deleted != 0 || len(snaps) != 0 {
		t.Errorf("expected zero results, got deleted=%d snaps=%d", deleted, len(snaps))
	}
}

func TestListOrphanedMotionEvents_OnlyOldUncovered(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")

	now := time.Now().UTC()
	old := now.Add(-48 * time.Hour)
	recent := now.Add(-1 * time.Hour)
	cutoff := now.Add(-24 * time.Hour)

	// Old event covered by a recording → NOT orphan.
	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: old.Add(-time.Minute),
		EndedAt:   old.Add(time.Minute),
		Path:      "/x/covered.mp4",
	}); err != nil {
		t.Fatalf("InsertRecording: %v", err)
	}
	insertTestEvent(t, database, "cam1", old, 0.5, "") // covered

	// Old event with no covering recording → orphan.
	insertTestEvent(t, database, "cam1", old.Add(30*time.Minute), 0.6, "")

	// Recent uncovered event → within retention, NOT orphan.
	insertTestEvent(t, database, "cam1", recent, 0.6, "")

	orphans, err := db.ListOrphanedMotionEvents(database, cutoff)
	if err != nil {
		t.Fatalf("ListOrphanedMotionEvents: %v", err)
	}
	if len(orphans) != 1 {
		t.Fatalf("expected 1 orphan, got %d", len(orphans))
	}
	want := old.Add(30 * time.Minute).Format(time.RFC3339)
	if got := orphans[0].OccurredAt.UTC().Format(time.RFC3339); got != want {
		t.Errorf("orphan occurred_at = %s, want %s", got, want)
	}
}
