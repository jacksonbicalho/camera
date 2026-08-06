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
// direta ao *db.DB para chamar SetCameraAnalysisConfig.
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
	cam3, err := db.CreateCamera(database, config.CameraConfig{Name: "cam3", RTSPURL: "rtsp://fake3"}, nil)
	if err != nil {
		t.Fatalf("criar câmera cam3: %v", err)
	}
	cam4, err := db.CreateCamera(database, config.CameraConfig{Name: "cam4", RTSPURL: "rtsp://fake4"}, nil)
	if err != nil {
		t.Fatalf("criar câmera cam4: %v", err)
	}
	cam1ID, cam2ID, cam3ID, cam4ID := cam1.ID, cam2.ID, cam3.ID, cam4.ID

	if err := db.SetUserCameras(database, viewerID, []string{cam1ID, cam3ID}); err != nil {
		t.Fatalf("set cameras: %v", err)
	}

	if err := db.SetCameraAnalysisConfig(database, cam2ID, db.CameraAnalysisConfig{Enabled: false}); err != nil {
		t.Fatalf("SetCameraAnalysisConfig: %v", err)
	}

	// cam3: caminho POSITIVO do critério composto — enabled=true E detector
	// escolhido, único cenário em que analysis_enabled deve ser true.
	detID, err := db.InsertObjectDetector(database, "yolo-cam3", map[string]string{
		"service_url": "http://yolo:8000",
	})
	if err != nil {
		t.Fatalf("InsertObjectDetector: %v", err)
	}
	if err := db.SetCameraAnalysisConfig(database, cam3ID, db.CameraAnalysisConfig{
		Enabled:    true,
		DetectorID: &detID,
	}); err != nil {
		t.Fatalf("SetCameraAnalysisConfig cam3: %v", err)
	}

	// cam4: última combinação do critério composto — detector escolhido MAS
	// enabled=false (ex.: usuário desmarcou o checkbox sem esquecer o
	// detector, ver T2). Sem este caso, uma implementação que checasse só
	// DetectorID (ignorando Enabled) passaria despercebida.
	if err := db.SetCameraAnalysisConfig(database, cam4ID, db.CameraAnalysisConfig{
		Enabled:    false,
		DetectorID: &detID,
	}); err != nil {
		t.Fatalf("SetCameraAnalysisConfig cam4: %v", err)
	}

	cameras := []config.CameraConfig{cam1, cam2, cam3, cam4}
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
		// CA4 (história fix/camera-analysis-toggle): analysis_enabled agora
		// exige detector_id também, não só enabled — cam1 nunca teve um
		// detector escolhido (sem linha em camera_analysis_config), então
		// nunca é de fato analisada (mesmo critério que
		// analyzeNewRecordings já usa) e o badge não deve aparecer pra ela —
		// tanto pela ausência de detector quanto pelo default de
		// GetCameraAnalysisConfig ter passado a ser Enabled=false (adendo
		// pré-push desta mesma história: "análise não pode ser padrão true").
		if got[cam1ID] != false {
			t.Errorf("cam1 (default, sem override, sem detector): esperava analysis_enabled=false, veio %v", got[cam1ID])
		}
		if got[cam2ID] != false {
			t.Errorf("cam2 (desabilitada explicitamente): esperava analysis_enabled=false, veio %v", got[cam2ID])
		}
		// cam3: caminho positivo — enabled=true E detector escolhido é o
		// ÚNICO cenário coberto por este teste que espera analysis_enabled
		// true; sem ele, uma implementação incorreta (ex.: sempre false, ou
		// só checar DetectorID e esquecer Enabled) passaria despercebida.
		if got[cam3ID] != true {
			t.Errorf("cam3 (enabled=true, com detector): esperava analysis_enabled=true, veio %v", got[cam3ID])
		}
		// cam4: detector escolhido mas enabled=false — fecha a 4ª combinação
		// do AND (ver comentário na criação de cam4 acima).
		if got[cam4ID] != false {
			t.Errorf("cam4 (enabled=false, com detector): esperava analysis_enabled=false, veio %v", got[cam4ID])
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
		// viewer tem acesso a cam1 e cam3 (SetUserCameras acima).
		if len(list) != 2 {
			t.Fatalf("esperava 2 câmeras visíveis ao viewer, veio %d", len(list))
		}
		got := map[string]any{}
		for _, c := range list {
			got[c["id"].(string)] = c["analysis_enabled"]
		}
		// CA4: ver comentários equivalentes no subteste acima — cam1 não tem
		// detector escolhido (analysis_enabled=false mesmo com o default
		// Enabled=true); cam3 tem enabled=true E detector, único caso true.
		if got[cam1ID] != false {
			t.Errorf("cam1: esperava analysis_enabled=false (sem detector), veio %v", got[cam1ID])
		}
		if got[cam3ID] != true {
			t.Errorf("cam3: esperava analysis_enabled=true (enabled + detector), veio %v", got[cam3ID])
		}
	})
}
