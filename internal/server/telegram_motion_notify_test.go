package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

func telegramNotifyServer(t *testing.T) (http.Handler, string, string) {
	t.Helper()
	database := openServerTestDB(t)

	if _, err := db.CreateUser(database, "admin_user", "adminpw", "admin", false); err != nil {
		t.Fatalf("criar admin: %v", err)
	}
	viewerID, err := db.CreateUser(database, "viewer_user", "viewerpw", "viewer", false)
	if err != nil {
		t.Fatalf("criar viewer: %v", err)
	}
	if err := db.SetUserCameras(database, viewerID, []string{"cam1"}); err != nil {
		t.Fatalf("set user cameras: %v", err)
	}

	cameras := []config.CameraConfig{
		{ID: "cam1", RTSPURL: "rtsp://fake1"},
		{ID: "cam2", RTSPURL: "rtsp://fake2"},
	}
	for _, cam := range cameras {
		if _, err := db.CreateCamera(database, cam, nil); err != nil {
			t.Fatalf("seed camera %q: %v", cam.ID, err)
		}
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", cameras, discardLogger(), nil).WithDB(database)

	adminToken := loginAndGetToken(t, srv, "admin_user", "adminpw")
	viewerToken := loginAndGetToken(t, srv, "viewer_user", "viewerpw")
	return srv, adminToken, viewerToken
}

func getCameraTelegramNotify(t *testing.T, srv http.Handler, token, cameraID string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/cameras/"+cameraID+"/telegram-notify", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	var body map[string]any
	json.NewDecoder(w.Body).Decode(&body)
	return w.Code, body
}

func putCameraTelegramNotify(t *testing.T, srv http.Handler, token, cameraID string, payload string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodPut, "/api/cameras/"+cameraID+"/telegram-notify", strings.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w.Code
}

func TestCameraTelegramNotify(t *testing.T) {
	t.Run("CA4: GET sem configuração devolve enabled=false e min_score=0", func(t *testing.T) {
		srv, adminToken, _ := telegramNotifyServer(t)
		code, body := getCameraTelegramNotify(t, srv, adminToken, "cam1")
		if code != http.StatusOK {
			t.Fatalf("expected 200, got %d", code)
		}
		if body["enabled"] != false {
			t.Errorf("expected enabled=false, got %v", body["enabled"])
		}
		if body["min_score"] != float64(0) {
			t.Errorf("expected min_score=0, got %v", body["min_score"])
		}
	})

	t.Run("CA4: PUT persiste e GET devolve o valor salvo", func(t *testing.T) {
		srv, adminToken, _ := telegramNotifyServer(t)
		if code := putCameraTelegramNotify(t, srv, adminToken, "cam1", `{"enabled":true,"min_score":0.08}`); code != http.StatusNoContent {
			t.Fatalf("expected 204, got %d", code)
		}
		code, body := getCameraTelegramNotify(t, srv, adminToken, "cam1")
		if code != http.StatusOK {
			t.Fatalf("expected 200, got %d", code)
		}
		if body["enabled"] != true {
			t.Errorf("expected enabled=true, got %v", body["enabled"])
		}
		if body["min_score"] != 0.08 {
			t.Errorf("expected min_score=0.08, got %v", body["min_score"])
		}
	})

	t.Run("CA4: PUT rejeita min_score fora de [0,1]", func(t *testing.T) {
		srv, adminToken, _ := telegramNotifyServer(t)
		if code := putCameraTelegramNotify(t, srv, adminToken, "cam1", `{"enabled":true,"min_score":1.5}`); code != http.StatusBadRequest {
			t.Errorf("expected 400 for min_score>1, got %d", code)
		}
		if code := putCameraTelegramNotify(t, srv, adminToken, "cam1", `{"enabled":true,"min_score":-0.1}`); code != http.StatusBadRequest {
			t.Errorf("expected 400 for negative min_score, got %d", code)
		}
	})

	t.Run("CA4: viewer com acesso à câmera pode GET/PUT sua própria preferência", func(t *testing.T) {
		srv, _, viewerToken := telegramNotifyServer(t)
		if code := putCameraTelegramNotify(t, srv, viewerToken, "cam1", `{"enabled":true,"min_score":0.05}`); code != http.StatusNoContent {
			t.Fatalf("expected 204, got %d", code)
		}
		code, body := getCameraTelegramNotify(t, srv, viewerToken, "cam1")
		if code != http.StatusOK {
			t.Fatalf("expected 200, got %d", code)
		}
		if body["enabled"] != true {
			t.Errorf("expected enabled=true, got %v", body["enabled"])
		}
	})

	t.Run("CA4: viewer sem acesso à câmera recebe forbidden no GET e no PUT", func(t *testing.T) {
		srv, _, viewerToken := telegramNotifyServer(t)
		if code, _ := getCameraTelegramNotify(t, srv, viewerToken, "cam2"); code != http.StatusForbidden {
			t.Errorf("expected 403 on GET cam2, got %d", code)
		}
		if code := putCameraTelegramNotify(t, srv, viewerToken, "cam2", `{"enabled":true,"min_score":0.05}`); code != http.StatusForbidden {
			t.Errorf("expected 403 on PUT cam2, got %d", code)
		}
	})

	t.Run("CA4: câmera inexistente devolve 404", func(t *testing.T) {
		srv, adminToken, _ := telegramNotifyServer(t)
		if code, _ := getCameraTelegramNotify(t, srv, adminToken, "no-such-cam"); code != http.StatusNotFound {
			t.Errorf("expected 404, got %d", code)
		}
	})

	t.Run("CA4: preferências de dois usuários pra mesma câmera são independentes", func(t *testing.T) {
		srv, adminToken, viewerToken := telegramNotifyServer(t)
		if code := putCameraTelegramNotify(t, srv, adminToken, "cam1", `{"enabled":true,"min_score":0.9}`); code != http.StatusNoContent {
			t.Fatalf("PUT admin: expected 204, got %d", code)
		}
		_, viewerBody := getCameraTelegramNotify(t, srv, viewerToken, "cam1")
		if viewerBody["enabled"] != false {
			t.Errorf("expected viewer's own opt-in to remain untouched by admin's PUT, got %v", viewerBody["enabled"])
		}
	})
}
