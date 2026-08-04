package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

// TestCameraListEndpoints_ExposeAnalysisEnabled — história
// feat(ui): badge, cards responsivos e header mobile do Ao vivo
// (work_progress/stories/202608040007_badge-cards-responsivo.md). O badge
// "Análise de objetos" no card de cada câmera (frontend) depende desse campo
// vir já pronto na listagem, sem N+1 request por câmera. Não reusa
// setupCamerasServer (cameras_test.go) porque precisa manter uma referência
// direta ao *db.DB para chamar SetCameraAnalysisEnabled.
func TestCameraListEndpoints_ExposeAnalysisEnabled(t *testing.T) {
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
	cam1ID, cam2ID := cam1.ID, cam2.ID

	if err := db.SetUserCameras(database, viewerID, []string{cam1ID}); err != nil {
		t.Fatalf("set cameras: %v", err)
	}

	if err := db.SetCameraAnalysisEnabled(database, cam2ID, false); err != nil {
		t.Fatalf("SetCameraAnalysisEnabled: %v", err)
	}

	cameras := []config.CameraConfig{cam1, cam2}
	srv := server.NewServer(config.ServerConfig{}, "UTC", cameras, discardLogger(), nil).
		WithDB(database)

	adminToken := loginAndGetToken(t, srv, "admin_user", "adminpw")
	viewerToken := loginAndGetToken(t, srv, "viewer_user", "viewerpw")

	t.Run("CA3: GET /api/settings/cameras expõe analysis_enabled por câmera", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/settings/cameras", nil)
		req.Header.Set("Authorization", "Bearer "+adminToken)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var list []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
			t.Fatalf("decode: %v", err)
		}
		got := map[string]any{}
		for _, c := range list {
			got[c["id"].(string)] = c["analysis_enabled"]
		}
		if got[cam1ID] != true {
			t.Errorf("cam1 (default, sem override): esperava analysis_enabled=true, veio %v", got[cam1ID])
		}
		if got[cam2ID] != false {
			t.Errorf("cam2 (desabilitada explicitamente): esperava analysis_enabled=false, veio %v", got[cam2ID])
		}
	})

	t.Run("CA3: GET /api/cameras expõe analysis_enabled por câmera", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/cameras", nil)
		req.Header.Set("Authorization", "Bearer "+viewerToken)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var list []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &list); err != nil {
			t.Fatalf("decode: %v", err)
		}
		// viewer só tem acesso a cam1 (SetUserCameras acima concede só essa).
		if len(list) != 1 {
			t.Fatalf("esperava 1 câmera visível ao viewer, veio %d", len(list))
		}
		if list[0]["analysis_enabled"] != true {
			t.Errorf("cam1: esperava analysis_enabled=true, veio %v", list[0]["analysis_enabled"])
		}
	})
}
