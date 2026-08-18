package server_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
	"camera/internal/stateclass"
)

// TestMomentsRecordingAvailable cobre a história fix/badge-momento-sem-gravacao:
// GET /api/moments passa a expor recording_available por momento — overlap com
// lead/trail pra eventos de movimento (mesma fórmula que a associação de
// has_motion em internal/storage/cleaner.go já usa), ponto estrito pra
// transições de estado (mesma fórmula que internal/db/state_classifiers.go's
// ListStateHistory já usa).
func TestMomentsRecordingAvailable(t *testing.T) {
	t.Run("CA2: recording_available de um evento de movimento reflete overlap com lead/trail", func(t *testing.T) {
		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
			t.Fatal(err)
		}
		cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://x/"}
		if _, err := db.CreateCamera(database, cam, &config.MotionConfig{
			PlaybackLeadSeconds: 10, PlaybackTrailSeconds: 10,
		}); err != nil {
			t.Fatal(err)
		}

		day := time.Date(2026, 6, 23, 0, 0, 0, 0, time.UTC)

		// Evento COBERTO: janela [12:00:50, 12:01:10] sobrepõe a gravação [12:00:00, 12:01:00)
		// (10s de trail leva a janela a bater no fim da gravação).
		covered := day.Add(12*time.Hour + 1*time.Minute)
		if err := db.InsertMotionEvent(database, db.MotionEvent{
			CameraID: "cam1", OccurredAt: covered, Score: 0.5, FramePath: "a.jpg",
		}); err != nil {
			t.Fatal(err)
		}
		if err := db.InsertRecording(database, db.Recording{
			CameraID: "cam1", StartedAt: day.Add(12 * time.Hour), EndedAt: day.Add(12*time.Hour + 1*time.Minute),
			Path: "cam1/covered.mp4",
		}); err != nil {
			t.Fatal(err)
		}

		// Evento SEM gravação nenhuma perto (buraco real). ANTES de qualquer gravação do
		// teste — em particular antes da gravação AINDA ABERTA mais abaixo, que (EndedAt
		// zero, "cobre até agora e além") cobriria qualquer instante posterior ao seu início.
		uncovered := day.Add(9 * time.Hour)
		if err := db.InsertMotionEvent(database, db.MotionEvent{
			CameraID: "cam1", OccurredAt: uncovered, Score: 0.5, FramePath: "b.jpg",
		}); err != nil {
			t.Fatal(err)
		}

		// Evento coberto por uma gravação AINDA ABERTA (EndedAt zero) — deve contar como
		// cobertura, mesmo tratamento que ListStateHistory já dá a ended_at IS NULL.
		openEnded := day.Add(14*time.Hour + 30*time.Second)
		if err := db.InsertMotionEvent(database, db.MotionEvent{
			CameraID: "cam1", OccurredAt: openEnded, Score: 0.5, FramePath: "c.jpg",
		}); err != nil {
			t.Fatal(err)
		}
		if err := db.InsertRecording(database, db.Recording{
			CameraID: "cam1", StartedAt: day.Add(14 * time.Hour), Path: "cam1/open.mp4",
		}); err != nil {
			t.Fatal(err)
		}

		srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).WithDB(database)
		token := loginAndGetToken(t, srv, "admin", "pw")
		w := doJSON(t, srv, http.MethodGet, "/api/moments?date=2026-06-23", token, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("moments: %d %s", w.Code, w.Body.String())
		}
		var out struct {
			Moments []struct {
				Time               string `json:"time"`
				RecordingAvailable bool   `json:"recording_available"`
			} `json:"moments"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		got := map[string]bool{}
		for _, m := range out.Moments {
			got[m.Time] = m.RecordingAvailable
		}
		if !got[covered.UTC().Format(time.RFC3339)] {
			t.Errorf("evento coberto por gravação fechada: esperava recording_available=true, resultado=%v", got)
		}
		if got[uncovered.UTC().Format(time.RFC3339)] {
			t.Errorf("evento sem gravação nenhuma: esperava recording_available=false, resultado=%v", got)
		}
		if !got[openEnded.UTC().Format(time.RFC3339)] {
			t.Errorf("evento coberto por gravação ainda aberta (ended_at NULL): esperava recording_available=true, resultado=%v", got)
		}
	})

	t.Run("CA3: recording_available de uma transição de estado reflete ponto estrito", func(t *testing.T) {
		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
			t.Fatal(err)
		}
		// cam1: transição COBERTA por uma gravação que engloba "agora".
		cam1 := config.CameraConfig{ID: "cam1", Name: "Coberta", RTSPURL: "rtsp://x/"}
		if _, err := db.CreateCamera(database, cam1, nil); err != nil {
			t.Fatal(err)
		}
		cid1, err := db.CreateStateClassifier(database, stateclass.Classifier{
			CameraID: "cam1", Name: "Portão", Model: "custom-cls", Threshold: 0.8,
			CropW: 0.3, CropH: 0.3, MinConsecutive: 1, Classes: []string{"aberto", "fechado"},
		})
		if err != nil {
			t.Fatal(err)
		}
		// cam2: transição SEM nenhuma gravação — recording_available deve ficar false.
		cam2 := config.CameraConfig{ID: "cam2", Name: "Descoberta", RTSPURL: "rtsp://x/"}
		if _, err := db.CreateCamera(database, cam2, nil); err != nil {
			t.Fatal(err)
		}
		cid2, err := db.CreateStateClassifier(database, stateclass.Classifier{
			CameraID: "cam2", Name: "Portão", Model: "custom-cls", Threshold: 0.8,
			CropW: 0.3, CropH: 0.3, MinConsecutive: 1, Classes: []string{"aberto", "fechado"},
		})
		if err != nil {
			t.Fatal(err)
		}

		// RecordStateTransition grava changed_at = time.Now() internamente — ancora a
		// gravação de teste relativa a "agora", igual TestStateClassifierHistory já faz.
		if err := db.RecordStateTransition(database, cid1, "aberto", 0.9, "/x.jpg"); err != nil {
			t.Fatal(err)
		}
		if err := db.RecordStateTransition(database, cid2, "aberto", 0.9, "/y.jpg"); err != nil {
			t.Fatal(err)
		}
		now := time.Now().UTC()
		if err := db.InsertRecording(database, db.Recording{
			CameraID: "cam1", StartedAt: now.Add(-time.Hour), EndedAt: now.Add(time.Hour), Path: "cam1/rec.mp4",
		}); err != nil {
			t.Fatal(err)
		}

		srv := server.NewServer(
			config.ServerConfig{}, "UTC", []config.CameraConfig{cam1, cam2}, discardLogger(), nil,
		).WithDB(database)
		token := loginAndGetToken(t, srv, "admin", "pw")
		w := doJSON(t, srv, http.MethodGet, "/api/moments?date="+now.Format("2006-01-02"), token, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("moments: %d %s", w.Code, w.Body.String())
		}
		var out struct {
			Moments []struct {
				CameraID           string `json:"camera_id"`
				Kind               string `json:"kind"`
				RecordingAvailable bool   `json:"recording_available"`
			} `json:"moments"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		got := map[string]bool{}
		for _, m := range out.Moments {
			if m.Kind == "state" {
				got[m.CameraID] = m.RecordingAvailable
			}
		}
		if avail, ok := got["cam1"]; !ok {
			t.Fatal("nenhum momento kind=state de cam1 encontrado na resposta")
		} else if !avail {
			t.Error("transição de cam1 coberta pela gravação: esperava recording_available=true, got false")
		}
		if avail, ok := got["cam2"]; !ok {
			t.Fatal("nenhum momento kind=state de cam2 encontrado na resposta")
		} else if avail {
			t.Error("transição de cam2 sem gravação nenhuma: esperava recording_available=false, got true")
		}
	})
}

// TestMomentsRespectsViewerAccess cobre a história
// fix/limpar-concessoes-camera-orfas — comportamento já correto hoje
// (handleMoments já filtra por db.GetUserCameras), sem cobertura de teste
// até agora. Mesmo padrão de TestGlobalContentDays_AggregatesAndRespectsAccess
// (content_days_test.go).
func TestMomentsRespectsViewerAccess(t *testing.T) {
	t.Run("CA4: viewer com acesso só a uma câmera não vê momentos de câmera não concedida", func(t *testing.T) {
		database := openServerTestDB(t)
		viewerID, err := db.CreateUser(database, "vw", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create viewer: %v", err)
		}
		cam1 := config.CameraConfig{ID: "cam1", Name: "Permitida", RTSPURL: "rtsp://x/"}
		cam2 := config.CameraConfig{ID: "cam2", Name: "Negada", RTSPURL: "rtsp://x/"}
		for _, cam := range []config.CameraConfig{cam1, cam2} {
			if _, err := db.CreateCamera(database, cam, nil); err != nil {
				t.Fatalf("create camera %s: %v", cam.ID, err)
			}
		}
		if err := db.SetUserCameras(database, viewerID, []string{"cam1"}); err != nil {
			t.Fatalf("grant: %v", err)
		}

		day := time.Date(2026, 6, 23, 0, 0, 0, 0, time.UTC)
		if err := db.InsertMotionEvent(database, db.MotionEvent{
			CameraID: "cam1", OccurredAt: day.Add(10 * time.Hour), Score: 0.5, FramePath: "a.jpg",
		}); err != nil {
			t.Fatal(err)
		}
		if err := db.InsertMotionEvent(database, db.MotionEvent{
			CameraID: "cam2", OccurredAt: day.Add(11 * time.Hour), Score: 0.5, FramePath: "b.jpg",
		}); err != nil {
			t.Fatal(err)
		}

		srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam1, cam2}, discardLogger(), nil).WithDB(database)
		token := loginAndGetToken(t, srv, "vw", "pw")
		w := doJSON(t, srv, http.MethodGet, "/api/moments?date=2026-06-23", token, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("moments: %d %s", w.Code, w.Body.String())
		}
		var out struct {
			Moments []struct {
				CameraID string `json:"camera_id"`
			} `json:"moments"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		for _, m := range out.Moments {
			if m.CameraID != "cam1" {
				t.Errorf("viewer sem acesso a %s não deveria ver esse momento, got %+v", m.CameraID, out.Moments)
			}
		}
		if len(out.Moments) == 0 {
			t.Error("esperava ao menos o momento de cam1 (câmera concedida)")
		}
	})
}
