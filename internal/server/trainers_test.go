package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"camera/internal/analysis"
	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

// TestTrainerAdapterPattern covers the story feat(analysis): trainer
// adapter pattern (yolo). Hits routes that don't exist yet (T3 pending) —
// the mux returns 404, a clean assertion failure, not a compile error (no
// new symbols are referenced from internal/server here).
func TestTrainerAdapterPattern(t *testing.T) {
	t.Run("CA3: CRUD REST de trainers (list/create/update/delete) via /api/settings/trainers", func(t *testing.T) {
		srv, token := setupDrivesServer(t)

		createBody := `{"name":"YOLO principal","type":"yolo","config":{"service_url":"http://yolo:8001"}}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/trainers", bytes.NewBufferString(createBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK && w.Code != http.StatusCreated {
			t.Fatalf("create: expected 200/201, got %d: %s", w.Code, w.Body.String())
		}
		var created map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
			t.Fatalf("unmarshal create response: %v", err)
		}
		id := created["id"]
		if created["type"] != "yolo" {
			t.Fatalf("expected type=yolo in create response, got %+v", created)
		}

		req = httptest.NewRequest(http.MethodGet, "/api/settings/trainers", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("list: expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var list []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
			t.Fatalf("unmarshal list: %v", err)
		}
		if len(list) != 1 {
			t.Fatalf("expected 1 trainer listed, got %d", len(list))
		}

		updateBody := `{"name":"YOLO principal v2","type":"yolo","config":{"service_url":"http://yolo:9001"}}`
		req = httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/settings/trainers/%v", id), bytes.NewBufferString(updateBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("update: expected 200, got %d: %s", w.Code, w.Body.String())
		}

		req = httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/api/settings/trainers/%v", id), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w = httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK && w.Code != http.StatusNoContent {
			t.Fatalf("delete: expected 200/204, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CA3: criar trainer yolo sem service_url é rejeitado", func(t *testing.T) {
		srv, token := setupDrivesServer(t)

		createBody := `{"name":"Sem URL","type":"yolo","config":{}}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/trainers", bytes.NewBufferString(createBody))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for yolo trainer missing service_url, got %d: %s", w.Code, w.Body.String())
		}
	})

	// CA4: handleStartFinetune despacha via o trainer cadastrado
	// (trainer_id), não mais video_analysis_config.ServiceURL direto.
	// video_analysis_config.ServiceURL fica vazio de propósito — se o
	// handler ainda lesse dali (comportamento de hoje), essa chamada
	// falharia com 503 "analysis service not configured", mesmo com um
	// trainer válido cadastrado. O trainer é inserido via SQL cru
	// (db.InsertTrainer ainda não existe nesta fase — a tabela nasce da
	// migration do T1, que roda independente dos accessors Go).
	t.Run("CA4: handleStartFinetune despacha via o trainer cadastrado (trainer_id)", func(t *testing.T) {
		var gotBaseModel string
		yoloSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/finetune" {
				http.NotFound(w, r)
				return
			}
			var req analysis.FinetuneRequest
			_ = json.NewDecoder(r.Body).Decode(&req)
			gotBaseModel = req.BaseModel
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"job_id":"job-abc"}`))
		}))
		defer yoloSrv.Close()

		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
			t.Fatalf("create admin: %v", err)
		}
		if err := db.UpdateVideoAnalysisConfig(database, db.VideoAnalysisConfig{
			ServiceURL: "", // deliberadamente vazio — ver comentário acima
			Model:      "yolov8n",
		}); err != nil {
			t.Fatalf("set analysis config: %v", err)
		}
		if _, err := db.CreateCamera(database, config.CameraConfig{ID: "cam1"}, nil); err != nil {
			t.Fatalf("create camera: %v", err)
		}
		if err := db.InsertMotionEvent(database, db.MotionEvent{
			CameraID:   "cam1",
			OccurredAt: time.Now(),
			Score:      0.5,
			FramePath:  "frame.jpg",
			Label:      "person",
		}); err != nil {
			t.Fatalf("InsertMotionEvent: %v", err)
		}

		res, err := database.Exec(`INSERT INTO trainers (name, type) VALUES ('yolo-trainer','yolo')`)
		if err != nil {
			t.Fatalf("insert trainer (raw sql — table from T1 migration): %v", err)
		}
		trainerID, err := res.LastInsertId()
		if err != nil {
			t.Fatalf("trainer last insert id: %v", err)
		}
		if _, err := database.Exec(
			`INSERT INTO trainer_config (trainer_id, key, value) VALUES (?, 'service_url', ?)`,
			trainerID, yoloSrv.URL,
		); err != nil {
			t.Fatalf("insert trainer_config: %v", err)
		}

		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
		adminToken := loginAndGetToken(t, srv, "admin", "pw")

		body := fmt.Sprintf(`{"trainer_id":%d,"epochs":5}`, trainerID)
		req := httptest.NewRequest(http.MethodPost, "/api/settings/analysis/finetune", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp analysis.FinetuneResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if resp.JobID != "job-abc" {
			t.Fatalf("expected job-abc, got %q", resp.JobID)
		}
		if gotBaseModel != "yolov8n" {
			t.Fatalf("expected base_model yolov8n (from video_analysis_config.Model), got %q", gotBaseModel)
		}
	})
}
