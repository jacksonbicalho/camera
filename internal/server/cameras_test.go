package server_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

// setupCamerasServer cria servidor com DB, um admin e duas câmeras iniciais.
// Retorna (handler, adminToken, viewerToken, cam1ID, cam2ID).
func setupCamerasServer(t *testing.T) (http.Handler, string, string, string, string) {
	t.Helper()
	database := openServerTestDB(t)

	if _, err := db.CreateUser(database, "admin_user", "adminpw", "admin", false); err != nil {
		t.Fatalf("criar admin: %v", err)
	}
	viewerID, err := db.CreateUser(database, "viewer_user", "viewerpw", "viewer", false)
	if err != nil {
		t.Fatalf("criar viewer: %v", err)
	}

	cam1, err := db.CreateCamera(database, config.CameraConfig{Name: "cam1", RTSPURL: "rtsp://fake1"}, nil)
	if err != nil {
		t.Fatalf("criar câmera cam1: %v", err)
	}
	cam2, err := db.CreateCamera(database, config.CameraConfig{Name: "cam2", RTSPURL: "rtsp://fake2"}, nil)
	if err != nil {
		t.Fatalf("criar câmera cam2: %v", err)
	}

	if err := db.SetUserCameras(database, viewerID, []string{cam1.ID}); err != nil {
		t.Fatalf("set cameras: %v", err)
	}

	cameras := []config.CameraConfig{cam1, cam2}
	srv := server.NewServer(config.ServerConfig{}, "UTC", cameras, discardLogger(), nil).
		WithDB(database)

	adminToken := loginAndGetToken(t, srv, "admin_user", "adminpw")
	viewerToken := loginAndGetToken(t, srv, "viewer_user", "viewerpw")
	return srv, adminToken, viewerToken, cam1.ID, cam2.ID
}

// --- GET /api/settings/cameras ---

func TestListSettingsCameras_ForbiddenForViewer(t *testing.T) {
	srv, _, viewerToken, _, _ := setupCamerasServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/settings/cameras", nil)
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestListSettingsCameras_ReturnsAll(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/settings/cameras", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var list []map[string]any
	json.NewDecoder(w.Body).Decode(&list)
	if len(list) != 2 {
		t.Fatalf("expected 2 cameras, got %d", len(list))
	}
	// rtsp_url deve vir na resposta (endpoint admin)
	if list[0]["rtsp_url"] == nil {
		t.Error("rtsp_url must be present in admin response")
	}
}

// --- POST /api/settings/cameras ---

func TestCreateCamera_Success(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)

	body := `{"name":"cam3","rtsp_url":"rtsp://fake3","chunk_duration":"2m"}`
	req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["name"] != "cam3" {
		t.Errorf("expected name=cam3, got %v", resp["name"])
	}
	if id, ok := resp["id"].(string); !ok || id == "" || id == "cam3" {
		t.Errorf("expected id to be a non-empty UUID, got %v", resp["id"])
	}
}

func TestCreateCamera_ForbiddenForViewer(t *testing.T) {
	srv, _, viewerToken, _, _ := setupCamerasServer(t)

	body := `{"name":"cam3","rtsp_url":"rtsp://fake3"}`
	req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestCreateCamera_MissingFields(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)

	body := `{"name":"cam3"}`
	req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

// --- PUT /api/settings/cameras/{id} ---

func TestUpdateCamera_Success(t *testing.T) {
	srv, adminToken, _, cam1ID, _ := setupCamerasServer(t)

	body := `{"name":"cam1","rtsp_url":"rtsp://updated","chunk_duration":"10m"}`
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+cam1ID, bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["rtsp_url"] != "rtsp://updated" {
		t.Errorf("expected rtsp_url=rtsp://updated, got %v", resp["rtsp_url"])
	}
}

func TestUpdateCamera_PersistsName(t *testing.T) {
	srv, adminToken, _, cam1ID, _ := setupCamerasServer(t)

	body := `{"name":"Corredor de entrada","rtsp_url":"rtsp://x"}`
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+cam1ID, bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["name"] != "Corredor de entrada" {
		t.Errorf("expected name=Corredor de entrada, got %v", resp["name"])
	}
}

func TestUpdateCamera_RejectsEmptyName(t *testing.T) {
	srv, adminToken, _, cam1ID, _ := setupCamerasServer(t)

	body := `{"name":"","rtsp_url":"rtsp://x"}`
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+cam1ID, bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty name, got %d: %s", w.Code, w.Body.String())
	}
}

func TestUpdateCamera_PreservesRTSPPasswordWhenMasked(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin_user", "adminpw", "admin", false); err != nil {
		t.Fatalf("criar admin: %v", err)
	}
	originalURL := "rtsp://admin:secret123@192.168.1.10:554/stream"
	cam, err := db.CreateCamera(database, config.CameraConfig{Name: "cam1", RTSPURL: originalURL}, nil)
	if err != nil {
		t.Fatalf("criar câmera: %v", err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
	adminToken := loginAndGetToken(t, srv, "admin_user", "adminpw")

	// Submit with masked URL (password replaced by "xxxxx" — Go's url.Redacted() sentinel)
	maskedURL := "rtsp://admin:xxxxx@192.168.1.10:554/stream"
	body := fmt.Sprintf(`{"name":"cam1","rtsp_url":%q}`, maskedURL)
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+cam.ID, bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// The stored URL must retain the original password, not "xxxxx"
	updated, err := db.GetCamera(database, cam.ID)
	if err != nil {
		t.Fatalf("GetCamera: %v", err)
	}
	if updated.RTSPURL != originalURL {
		t.Errorf("expected RTSP URL %q, got %q", originalURL, updated.RTSPURL)
	}
}

func TestUpdateCamera_PreservesPasswordWhenHostChanges(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin_user", "adminpw", "admin", false); err != nil {
		t.Fatalf("criar admin: %v", err)
	}
	originalURL := "rtsp://admin:secret123@192.168.1.29:554/stream"
	cam, err := db.CreateCamera(database, config.CameraConfig{Name: "cam1", RTSPURL: originalURL}, nil)
	if err != nil {
		t.Fatalf("criar câmera: %v", err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
	adminToken := loginAndGetToken(t, srv, "admin_user", "adminpw")

	// Usuário muda o host (.29 → .16) mas mantém a senha mascarada
	newHostMasked := "rtsp://admin:xxxxx@192.168.1.16:554/stream"
	body := fmt.Sprintf(`{"name":"cam1","rtsp_url":%q}`, newHostMasked)
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+cam.ID, bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	updated, err := db.GetCamera(database, cam.ID)
	if err != nil {
		t.Fatalf("GetCamera: %v", err)
	}
	want := "rtsp://admin:secret123@192.168.1.16:554/stream"
	if updated.RTSPURL != want {
		t.Errorf("got RTSP URL %q, want %q", updated.RTSPURL, want)
	}
}

func TestUpdateCamera_NotFound(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)

	body := `{"rtsp_url":"rtsp://x"}`
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/inexistente", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

// --- DELETE /api/settings/cameras/{id} ---

func TestDeleteCamera_Success(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin_user", "adminpw", "admin", false); err != nil {
		t.Fatalf("criar admin: %v", err)
	}
	cam, err := db.CreateCamera(database, config.CameraConfig{Name: "todelete", RTSPURL: "rtsp://x"}, nil)
	if err != nil {
		t.Fatalf("criar câmera: %v", err)
	}

	cameras := []config.CameraConfig{cam}
	srv := server.NewServer(config.ServerConfig{}, "UTC", cameras, discardLogger(), nil).WithDB(database)
	adminToken := loginAndGetToken(t, srv, "admin_user", "adminpw")

	req := httptest.NewRequest(http.MethodDelete, "/api/settings/cameras/"+cam.ID, nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}

	cams, _ := db.ListCameras(database)
	for _, c := range cams {
		if c.ID == cam.ID {
			t.Error("camera should have been deleted from DB")
		}
	}
}

func TestDeleteCamera_NotFound(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)

	req := httptest.NewRequest(http.MethodDelete, "/api/settings/cameras/inexistente", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

func TestDeleteCamera_ForbiddenForViewer(t *testing.T) {
	srv, _, viewerToken, cam1ID, _ := setupCamerasServer(t)

	req := httptest.NewRequest(http.MethodDelete, "/api/settings/cameras/"+cam1ID, nil)
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

// --- callbacks de ciclo de vida ---

func TestCreateCamera_CallsOnCameraStart(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin_user", "adminpw", "admin", false); err != nil {
		t.Fatalf("criar admin: %v", err)
	}

	var startedNames []string
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
		WithDB(database).
		WithCameraCallbacks(
			func(cam config.CameraConfig) { startedNames = append(startedNames, cam.Name) },
			nil,
		)
	adminToken := loginAndGetToken(t, srv, "admin_user", "adminpw")

	req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras",
		strings.NewReader(`{"name":"cam1","rtsp_url":"rtsp://fake"}`))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	time.Sleep(50 * time.Millisecond)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", w.Code)
	}
	if len(startedNames) != 1 || startedNames[0] != "cam1" {
		t.Errorf("expected onCameraStart with name=cam1, got %v", startedNames)
	}
}

func TestDeleteCamera_CallsOnCameraStop(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin_user", "adminpw", "admin", false); err != nil {
		t.Fatalf("criar admin: %v", err)
	}
	cam, err := db.CreateCamera(database, config.CameraConfig{Name: "cam1", RTSPURL: "rtsp://x"}, nil)
	if err != nil {
		t.Fatalf("criar câmera: %v", err)
	}

	var stopped []string
	srv := server.NewServer(config.ServerConfig{}, "UTC",
		[]config.CameraConfig{cam}, discardLogger(), nil).
		WithDB(database).
		WithCameraCallbacks(nil, func(id string) { stopped = append(stopped, id) })
	adminToken := loginAndGetToken(t, srv, "admin_user", "adminpw")

	req := httptest.NewRequest(http.MethodDelete, "/api/settings/cameras/"+cam.ID, nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", w.Code)
	}
	if len(stopped) != 1 || stopped[0] != cam.ID {
		t.Errorf("expected onCameraStop(%s), got %v", cam.ID, stopped)
	}
}

// --- validação de campos ---

func doCreateWithMotion(t *testing.T, srv http.Handler, token, motionJSON string) int {
	t.Helper()
	body := `{"name":"camV","rtsp_url":"rtsp://v","motion":` + motionJSON + `}`
	req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w.Code
}

func doUpdateWithMotion(t *testing.T, srv http.Handler, token, camID, motionJSON string) int {
	t.Helper()
	body := `{"name":"camV","rtsp_url":"rtsp://v","motion":` + motionJSON + `}`
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+camID, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w.Code
}

func TestCreateCamera_InvalidMotionThreshold(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)
	if code := doCreateWithMotion(t, srv, adminToken, `{"enabled":true,"threshold":1.5}`); code != http.StatusBadRequest {
		t.Fatalf("expected 400 for threshold=1.5, got %d", code)
	}
	if code := doCreateWithMotion(t, srv, adminToken, `{"enabled":true,"threshold":-0.1}`); code != http.StatusBadRequest {
		t.Fatalf("expected 400 for threshold=-0.1, got %d", code)
	}
}

func TestCreateCamera_InvalidMotionFPS(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)
	if code := doCreateWithMotion(t, srv, adminToken, `{"enabled":true,"fps":31}`); code != http.StatusBadRequest {
		t.Fatalf("expected 400 for fps=31, got %d", code)
	}
}

func TestCreateCamera_InvalidMotionCooldown(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)
	if code := doCreateWithMotion(t, srv, adminToken, `{"enabled":true,"cooldown_seconds":-1}`); code != http.StatusBadRequest {
		t.Fatalf("expected 400 for cooldown_seconds=-1, got %d", code)
	}
}

func TestCreateCamera_InvalidMotionPlaybackLead(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)
	if code := doCreateWithMotion(t, srv, adminToken, `{"enabled":true,"playback_lead_seconds":301}`); code != http.StatusBadRequest {
		t.Fatalf("expected 400 for playback_lead_seconds=301, got %d", code)
	}
	if code := doCreateWithMotion(t, srv, adminToken, `{"enabled":true,"playback_lead_seconds":-1}`); code != http.StatusBadRequest {
		t.Fatalf("expected 400 for playback_lead_seconds=-1, got %d", code)
	}
}

func TestCreateCamera_ZeroMotionFieldsAreValid(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)
	// threshold=0 e fps=0 significam "usar padrão do sistema" — devem ser aceitos
	if code := doCreateWithMotion(t, srv, adminToken, `{"enabled":true,"threshold":0,"fps":0}`); code != http.StatusCreated {
		t.Fatalf("expected 201 for zero-value defaults, got %d", code)
	}
}

func TestCreateCamera_InvalidChunkDuration(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)
	body := `{"name":"camDur","rtsp_url":"rtsp://dur","chunk_duration":"banana"}`
	req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad chunk_duration, got %d", w.Code)
	}
}

func TestCreateCamera_InvalidReconnectInterval(t *testing.T) {
	srv, adminToken, _, _, _ := setupCamerasServer(t)
	body := `{"name":"camRec","rtsp_url":"rtsp://rec","reconnect_interval":"nope"}`
	req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad reconnect_interval, got %d", w.Code)
	}
}

func TestUpdateCamera_InvalidMotionThreshold(t *testing.T) {
	srv, adminToken, _, cam1ID, _ := setupCamerasServer(t)
	if code := doUpdateWithMotion(t, srv, adminToken, cam1ID, `{"enabled":true,"threshold":2.0}`); code != http.StatusBadRequest {
		t.Fatalf("expected 400 for threshold=2.0 on PUT, got %d", code)
	}
}

func TestUpdateCamera_InvalidChunkDuration(t *testing.T) {
	srv, adminToken, _, cam1ID, _ := setupCamerasServer(t)
	body := `{"name":"camChunk","rtsp_url":"rtsp://x","chunk_duration":"abc"}`
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+cam1ID, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad chunk_duration on PUT, got %d", w.Code)
	}
}

func TestUpdateCamera_CallsStopThenStart(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin_user", "adminpw", "admin", false); err != nil {
		t.Fatalf("criar admin: %v", err)
	}
	cam, err := db.CreateCamera(database, config.CameraConfig{Name: "cam1", RTSPURL: "rtsp://old"}, nil)
	if err != nil {
		t.Fatalf("criar câmera: %v", err)
	}

	var calls []string
	srv := server.NewServer(config.ServerConfig{}, "UTC",
		[]config.CameraConfig{cam}, discardLogger(), nil).
		WithDB(database).
		WithCameraCallbacks(
			func(c config.CameraConfig) { calls = append(calls, "start:"+c.ID) },
			func(id string) { calls = append(calls, "stop:"+id) },
		)
	adminToken := loginAndGetToken(t, srv, "admin_user", "adminpw")

	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+cam.ID,
		strings.NewReader(`{"name":"cam1","rtsp_url":"rtsp://new"}`))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	time.Sleep(50 * time.Millisecond)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if len(calls) != 2 || calls[0] != "stop:"+cam.ID || calls[1] != "start:"+cam.ID {
		t.Errorf("expected [stop:%s, start:%s], got %v", cam.ID, cam.ID, calls)
	}
}

// --- PUT /api/settings/cameras/reorder ---

func TestReorderCameras_Success(t *testing.T) {
	srv, adminToken, _, cam1ID, cam2ID := setupCamerasServer(t)

	body := fmt.Sprintf(`{"ids":[%q,%q]}`, cam2ID, cam1ID)
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/reorder", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+adminToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", w.Code, w.Body.String())
	}

	// Verify order via list endpoint.
	req2 := httptest.NewRequest(http.MethodGet, "/api/settings/cameras", nil)
	req2.Header.Set("Authorization", "Bearer "+adminToken)
	w2 := httptest.NewRecorder()
	srv.ServeHTTP(w2, req2)

	var list []map[string]any
	json.NewDecoder(w2.Body).Decode(&list)
	if len(list) != 2 {
		t.Fatalf("expected 2 cameras, got %d", len(list))
	}
	if list[0]["id"] != cam2ID {
		t.Errorf("first camera: got %v, want %v", list[0]["id"], cam2ID)
	}
	if list[1]["id"] != cam1ID {
		t.Errorf("second camera: got %v, want %v", list[1]["id"], cam1ID)
	}
}

func TestReorderCameras_ForbiddenForViewer(t *testing.T) {
	srv, _, viewerToken, cam1ID, cam2ID := setupCamerasServer(t)

	body := fmt.Sprintf(`{"ids":[%q,%q]}`, cam1ID, cam2ID)
	req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/reorder", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+viewerToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

// --- capture_type (história feat/hls-capture-fundacao) ---

func TestCameraCaptureType(t *testing.T) {
	t.Run("CA3: POST sem capture_type usa o default rtsp", func(t *testing.T) {
		srv, adminToken, _, _, _ := setupCamerasServer(t)

		body := `{"name":"cam-default","rtsp_url":"rtsp://fake-default"}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		json.NewDecoder(w.Body).Decode(&resp)
		if resp["capture_type"] != "rtsp" {
			t.Errorf("expected capture_type=rtsp by default, got %v", resp["capture_type"])
		}
	})

	t.Run("CA3: POST com capture_type=hls persiste e retorna hls", func(t *testing.T) {
		srv, adminToken, _, _, _ := setupCamerasServer(t)

		body := `{"name":"cam-hls","rtsp_url":"https://cam.example.com/stream/playlist.m3u8","capture_type":"hls"}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		json.NewDecoder(w.Body).Decode(&resp)
		if resp["capture_type"] != "hls" {
			t.Errorf("expected capture_type=hls, got %v", resp["capture_type"])
		}
		id, _ := resp["id"].(string)

		// GET /api/settings/cameras deve refletir o valor persistido.
		req2 := httptest.NewRequest(http.MethodGet, "/api/settings/cameras", nil)
		req2.Header.Set("Authorization", "Bearer "+adminToken)
		w2 := httptest.NewRecorder()
		srv.ServeHTTP(w2, req2)
		var list []map[string]any
		json.NewDecoder(w2.Body).Decode(&list)
		found := false
		for _, c := range list {
			if c["id"] == id {
				found = true
				if c["capture_type"] != "hls" {
					t.Errorf("list: expected capture_type=hls, got %v", c["capture_type"])
				}
			}
		}
		if !found {
			t.Fatalf("camera %s não encontrada em GET /api/settings/cameras", id)
		}

		// GET /api/settings (handleSettings) também deve refletir.
		req3 := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
		req3.Header.Set("Authorization", "Bearer "+adminToken)
		w3 := httptest.NewRecorder()
		srv.ServeHTTP(w3, req3)
		var settings map[string]any
		json.NewDecoder(w3.Body).Decode(&settings)
		cams, _ := settings["cameras"].([]any)
		found = false
		for _, raw := range cams {
			c, _ := raw.(map[string]any)
			if c["id"] == id {
				found = true
				if c["capture_type"] != "hls" {
					t.Errorf("GET /api/settings: expected capture_type=hls, got %v", c["capture_type"])
				}
			}
		}
		if !found {
			t.Fatalf("camera %s não encontrada em GET /api/settings", id)
		}
	})

	t.Run("CA3: PUT atualiza capture_type de rtsp pra hls", func(t *testing.T) {
		srv, adminToken, _, cam1ID, _ := setupCamerasServer(t)

		body := `{"name":"cam1","rtsp_url":"https://cam.example.com/playlist.m3u8","capture_type":"hls"}`
		req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+cam1ID, bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		json.NewDecoder(w.Body).Decode(&resp)
		if resp["capture_type"] != "hls" {
			t.Errorf("expected capture_type=hls after update, got %v", resp["capture_type"])
		}
	})

	// --- capture_type=mjpeg (história feat/capture-mjpeg) ---

	t.Run("CA3: POST com capture_type=mjpeg persiste e retorna mjpeg", func(t *testing.T) {
		srv, adminToken, _, _, _ := setupCamerasServer(t)

		body := `{"name":"cam-mjpeg","rtsp_url":"https://195.196.36.242/mjpg/video.mjpg","capture_type":"mjpeg"}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		json.NewDecoder(w.Body).Decode(&resp)
		if resp["capture_type"] != "mjpeg" {
			t.Errorf("expected capture_type=mjpeg, got %v", resp["capture_type"])
		}
	})
}

// --- live_enabled (história feat/hls-capture-backend-completo) ---

func TestCameraLiveEnabled(t *testing.T) {
	t.Run("CA2: POST sem live_enabled usa o default true", func(t *testing.T) {
		srv, adminToken, _, _, _ := setupCamerasServer(t)

		body := `{"name":"cam-default","rtsp_url":"rtsp://fake-default"}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		json.NewDecoder(w.Body).Decode(&resp)
		if resp["live_enabled"] != true {
			t.Errorf("expected live_enabled=true by default, got %v", resp["live_enabled"])
		}
	})

	t.Run("CA2: POST com live_enabled=false persiste e retorna false", func(t *testing.T) {
		srv, adminToken, _, _, _ := setupCamerasServer(t)

		body := `{"name":"cam-live-off","rtsp_url":"rtsp://fake-off","live_enabled":false}`
		req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		json.NewDecoder(w.Body).Decode(&resp)
		if resp["live_enabled"] != false {
			t.Errorf("expected live_enabled=false, got %v", resp["live_enabled"])
		}
		id, _ := resp["id"].(string)

		// GET /api/settings/cameras deve refletir o valor persistido.
		req2 := httptest.NewRequest(http.MethodGet, "/api/settings/cameras", nil)
		req2.Header.Set("Authorization", "Bearer "+adminToken)
		w2 := httptest.NewRecorder()
		srv.ServeHTTP(w2, req2)
		var list []map[string]any
		json.NewDecoder(w2.Body).Decode(&list)
		found := false
		for _, c := range list {
			if c["id"] == id {
				found = true
				if c["live_enabled"] != false {
					t.Errorf("list: expected live_enabled=false, got %v", c["live_enabled"])
				}
			}
		}
		if !found {
			t.Fatalf("camera %s não encontrada em GET /api/settings/cameras", id)
		}

		// GET /api/settings (handleSettings) também deve refletir.
		req3 := httptest.NewRequest(http.MethodGet, "/api/settings", nil)
		req3.Header.Set("Authorization", "Bearer "+adminToken)
		w3 := httptest.NewRecorder()
		srv.ServeHTTP(w3, req3)
		var settings map[string]any
		json.NewDecoder(w3.Body).Decode(&settings)
		cams, _ := settings["cameras"].([]any)
		found = false
		for _, raw := range cams {
			c, _ := raw.(map[string]any)
			if c["id"] == id {
				found = true
				if c["live_enabled"] != false {
					t.Errorf("GET /api/settings: expected live_enabled=false, got %v", c["live_enabled"])
				}
			}
		}
		if !found {
			t.Fatalf("camera %s não encontrada em GET /api/settings", id)
		}
	})

	t.Run("CA2: PUT atualiza live_enabled de true pra false", func(t *testing.T) {
		srv, adminToken, _, cam1ID, _ := setupCamerasServer(t)

		body := `{"name":"cam1","rtsp_url":"rtsp://fake1","live_enabled":false}`
		req := httptest.NewRequest(http.MethodPut, "/api/settings/cameras/"+cam1ID, bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+adminToken)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp map[string]any
		json.NewDecoder(w.Body).Decode(&resp)
		if resp["live_enabled"] != false {
			t.Errorf("expected live_enabled=false after update, got %v", resp["live_enabled"])
		}
	})
}
