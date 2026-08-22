package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

func setupEventByIDTest(t *testing.T) (srv *server.Server, token string, eventID int64) {
	t.Helper()
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "master", "secret", "admin", false); err != nil {
		t.Fatal(err)
	}
	if _, err := db.CreateCamera(database, config.CameraConfig{ID: "cam1"}, nil); err != nil {
		t.Fatal(err)
	}
	ev := db.MotionEvent{
		CameraID:   "cam1",
		OccurredAt: time.Date(2026, 5, 3, 10, 0, 0, 0, time.UTC),
		Score:      0.75,
		Label:      "pessoa",
		Color:      "#ff0000",
		BboxX:      0.1,
		BboxY:      0.2,
		BboxW:      0.3,
		BboxH:      0.4,
	}
	if err := db.InsertMotionEvent(database, ev); err != nil {
		t.Fatal(err)
	}
	events, err := db.ListMotionEvents(database, "cam1",
		time.Date(2026, 5, 3, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 5, 4, 0, 0, 0, 0, time.UTC),
	)
	if err != nil || len(events) == 0 {
		t.Fatal("expected inserted event")
	}
	eventID = events[0].ID

	cfg := config.ServerConfig{}
	srv = server.NewServer(cfg, "UTC", []config.CameraConfig{{ID: "cam1"}}, discardLogger(), nil).WithDB(database)
	token = loginAndGetToken(t, srv, "master", "secret")
	return
}

func TestGetEventByID_ReturnsEvent(t *testing.T) {
	srv, token, eventID := setupEventByIDTest(t)

	req := httptest.NewRequest(http.MethodGet, "/api/events/"+strconv.FormatInt(eventID, 10), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var ev struct {
		ID    int64   `json:"id"`
		Time  string  `json:"time"`
		Score float64 `json:"score"`
		Label string  `json:"label"`
		Color string  `json:"color"`
		Bbox  struct {
			X, Y, W, H float64
		} `json:"bbox"`
	}
	if err := json.NewDecoder(w.Body).Decode(&ev); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if ev.ID != eventID {
		t.Errorf("expected id %d, got %d", eventID, ev.ID)
	}
	if ev.Time != "2026-05-03T10:00:00Z" {
		t.Errorf("expected time 2026-05-03T10:00:00Z, got %q", ev.Time)
	}
	if ev.Score != 0.75 {
		t.Errorf("expected score 0.75, got %v", ev.Score)
	}
	if ev.Label != "pessoa" {
		t.Errorf("expected label pessoa, got %q", ev.Label)
	}
	if ev.Bbox.X != 0.1 || ev.Bbox.W != 0.3 {
		t.Errorf("expected bbox x=0.1 w=0.3, got %+v", ev.Bbox)
	}
}

func TestGetEventByID_NotFound(t *testing.T) {
	srv, token, _ := setupEventByIDTest(t)

	req := httptest.NewRequest(http.MethodGet, "/api/events/999999", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestGetEventByID_RequiresAuth(t *testing.T) {
	cfg := config.ServerConfig{}
	srv := server.NewServer(cfg, "UTC", nil, discardLogger(), nil)

	req := httptest.NewRequest(http.MethodGet, "/api/events/1", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}
