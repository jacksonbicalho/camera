package server_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
	"camera/internal/stateclass"
)

// A API de classificador persiste e devolve os flags + destinatários por canal.
func TestClassifierNotifyConfigPersisted(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
		t.Fatal(err)
	}
	u1, err := db.CreateUser(database, "v1", "pw", "viewer", false)
	if err != nil {
		t.Fatal(err)
	}
	cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://x/"}
	if _, err := db.CreateCamera(database, cam, nil); err != nil {
		t.Fatal(err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "admin", "pw")

	body := validClassifierBody()
	body["notify_enabled"] = true
	body["footer_enabled"] = true
	body["notify_user_ids"] = []int64{u1}
	body["footer_user_ids"] = []int64{u1}
	w := doJSON(t, srv, http.MethodPost, "/api/settings/cameras/cam1/classifiers", token, body)
	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}

	w = doJSON(t, srv, http.MethodGet, "/api/settings/cameras/cam1/classifiers", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list: %d", w.Code)
	}
	var list []struct {
		NotifyEnabled bool    `json:"notify_enabled"`
		FooterEnabled bool    `json:"footer_enabled"`
		NotifyUserIDs []int64 `json:"notify_user_ids"`
		FooterUserIDs []int64 `json:"footer_user_ids"`
	}
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Fatalf("esperava 1 classificador, got %d", len(list))
	}
	if !list[0].NotifyEnabled || !list[0].FooterEnabled {
		t.Fatalf("flags não persistidos: %+v", list[0])
	}
	if !reflect.DeepEqual(list[0].NotifyUserIDs, []int64{u1}) || !reflect.DeepEqual(list[0].FooterUserIDs, []int64{u1}) {
		t.Fatalf("recipients não persistidos: %+v", list[0])
	}
}

func setupClassifierServer(t *testing.T) (*server.Server, string, string) {
	t.Helper()
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
		t.Fatalf("create user: %v", err)
	}
	cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://admin:pw@192.168.1.29:554/"}
	if _, err := db.CreateCamera(database, cam, nil); err != nil {
		t.Fatalf("create camera: %v", err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "admin", "pw")
	return srv, token, cam.ID
}

func doJSON(t *testing.T, srv *server.Server, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w
}

func validClassifierBody() map[string]any {
	return map[string]any{
		"name":           "Portão",
		"threshold":      0.8,
		"trigger_motion": true,
		"crop_x":         0.1, "crop_y": 0.1, "crop_w": 0.3, "crop_h": 0.3,
		"classes": []string{"aberto", "fechado"},
	}
}

func TestClassifierCreateAndList(t *testing.T) {
	srv, token, id := setupClassifierServer(t)

	w := doJSON(t, srv, http.MethodPost, "/api/settings/cameras/"+id+"/classifiers", token, validClassifierBody())
	if w.Code != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var created struct {
		ID      int64    `json:"id"`
		Classes []string `json:"classes"`
	}
	json.Unmarshal(w.Body.Bytes(), &created)
	if created.ID == 0 || len(created.Classes) != 2 {
		t.Fatalf("unexpected created: %+v", created)
	}

	w = doJSON(t, srv, http.MethodGet, "/api/settings/cameras/"+id+"/classifiers", token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("list: %d", w.Code)
	}
	var list []map[string]any
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 1 {
		t.Fatalf("expected 1 classifier, got %d", len(list))
	}
}

// TestClassifierNameUniquePerCamera cobre a história feat/estados-categoria-granular
// (pré-requisito identificado pelo navigator na revisão da análise): nome de
// classificador precisa ser único POR CÂMERA — a categoria composta
// estados:<slug-do-nome>:<estado> depende disso pra não ficar ambígua.
func TestClassifierNameUniquePerCamera(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
		t.Fatal(err)
	}
	cam1 := config.CameraConfig{ID: "cam1", Name: "Cam1", RTSPURL: "rtsp://x/"}
	cam2 := config.CameraConfig{ID: "cam2", Name: "Cam2", RTSPURL: "rtsp://x/"}
	if _, err := db.CreateCamera(database, cam1, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := db.CreateCamera(database, cam2, nil); err != nil {
		t.Fatal(err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam1, cam2}, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "admin", "pw")

	body := validClassifierBody()
	body["name"] = "Pessoa"
	w := doJSON(t, srv, http.MethodPost, "/api/settings/cameras/cam1/classifiers", token, body)
	if w.Code != http.StatusCreated {
		t.Fatalf("1º create (cam1): expected 201, got %d: %s", w.Code, w.Body.String())
	}

	t.Run("CA2: nome duplicado na MESMA câmera é rejeitado com erro claro (409)", func(t *testing.T) {
		w := doJSON(t, srv, http.MethodPost, "/api/settings/cameras/cam1/classifiers", token, body)
		if w.Code != http.StatusConflict {
			t.Fatalf("2º create (mesmo nome, cam1): expected 409, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CA2: mesmo nome em câmera DIFERENTE continua permitido", func(t *testing.T) {
		w := doJSON(t, srv, http.MethodPost, "/api/settings/cameras/cam2/classifiers", token, body)
		if w.Code != http.StatusCreated {
			t.Fatalf("create (mesmo nome, cam2): expected 201, got %d: %s", w.Code, w.Body.String())
		}
	})

	// 2º classificador em cam1, nome distinto — pra exercitar o caminho de UPDATE:
	// (a) salvar sem mudar o nome não pode se autobloquear (excludeID); (b) renomear
	// pra colidir com um nome já usado na mesma câmera deve continuar rejeitado.
	portaoBody := validClassifierBody()
	portaoBody["name"] = "Portão"
	w2 := doJSON(t, srv, http.MethodPost, "/api/settings/cameras/cam1/classifiers", token, portaoBody)
	if w2.Code != http.StatusCreated {
		t.Fatalf("create Portão (cam1): expected 201, got %d: %s", w2.Code, w2.Body.String())
	}
	var portao struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(w2.Body.Bytes(), &portao)

	t.Run("CA2: salvar (PUT) sem mudar o nome não se autobloqueia (excludeID)", func(t *testing.T) {
		w := doJSON(t, srv, http.MethodPut, "/api/settings/cameras/cam1/classifiers/"+strconv.FormatInt(portao.ID, 10), token, portaoBody)
		if w.Code != http.StatusOK {
			t.Fatalf("update sem mudar nome: expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("CA2: renomear (PUT) pra um nome já usado por OUTRO classificador da MESMA câmera é rejeitado (409)", func(t *testing.T) {
		renamed := validClassifierBody()
		renamed["name"] = "Pessoa" // já existe em cam1 (o classificador criado no início do teste)
		w := doJSON(t, srv, http.MethodPut, "/api/settings/cameras/cam1/classifiers/"+strconv.FormatInt(portao.ID, 10), token, renamed)
		if w.Code != http.StatusConflict {
			t.Fatalf("update renomeando pra nome duplicado: expected 409, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestClassifierValidation(t *testing.T) {
	srv, token, id := setupClassifierServer(t)
	path := "/api/settings/cameras/" + id + "/classifiers"

	cases := map[string]func(map[string]any){
		"name vazio":    func(b map[string]any) { b["name"] = "  " },
		"< 2 classes":   func(b map[string]any) { b["classes"] = []string{"aberto"} },
		"crop inválido": func(b map[string]any) { b["crop_w"] = 0.95; b["crop_x"] = 0.5 },
		"sem gatilho":   func(b map[string]any) { b["trigger_motion"] = false },
	}
	for name, mutate := range cases {
		body := validClassifierBody()
		mutate(body)
		w := doJSON(t, srv, http.MethodPost, path, token, body)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("%s: expected 400, got %d: %s", name, w.Code, w.Body.String())
		}
	}
}

func TestClassifierUpdateDeleteAndState(t *testing.T) {
	srv, token, id := setupClassifierServer(t)
	base := "/api/settings/cameras/" + id + "/classifiers"

	w := doJSON(t, srv, http.MethodPost, base, token, validClassifierBody())
	var created struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(w.Body.Bytes(), &created)
	cidPath := base + "/" + strconv.FormatInt(created.ID, 10)

	// update
	upd := validClassifierBody()
	upd["name"] = "Portão lateral"
	w = doJSON(t, srv, http.MethodPut, cidPath, token, upd)
	if w.Code != http.StatusOK {
		t.Fatalf("update: %d %s", w.Code, w.Body.String())
	}

	// state (vazio até a S3) — rota cameraAccess
	w = doJSON(t, srv, http.MethodGet, "/api/cameras/"+id+"/classifiers/"+strconv.FormatInt(created.ID, 10)+"/state", token, nil)
	if w.Code != http.StatusOK || w.Body.String() != "null\n" {
		t.Fatalf("state: expected 200 null, got %d %q", w.Code, w.Body.String())
	}

	// delete
	w = doJSON(t, srv, http.MethodDelete, cidPath, token, nil)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", w.Code)
	}
	w = doJSON(t, srv, http.MethodGet, base, token, nil)
	var list []map[string]any
	json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 0 {
		t.Fatalf("expected empty after delete, got %d", len(list))
	}
}

// Excluir um classificador remove state_history/state_samples daquele
// classificador do disco, sem afetar os de outro classificador — antes desse
// fix, db.DeleteStateClassifier só limpava as linhas de banco (cascade),
// deixando os thumbnails órfãos pra sempre.
func TestHandleStateClassifierDelete_RemovesDiskDirs(t *testing.T) {
	t.Run("CA4: excluir um classificador remove state_history/state_samples do disco sem afetar outro classificador", func(t *testing.T) {
		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
			t.Fatal(err)
		}
		cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://x/"}
		if _, err := db.CreateCamera(database, cam, nil); err != nil {
			t.Fatal(err)
		}
		storagePath := t.TempDir()
		srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).
			WithDB(database).
			WithStorageConfig(config.StorageConfig{Path: storagePath})
		token := loginAndGetToken(t, srv, "admin", "pw")
		base := "/api/settings/cameras/cam1/classifiers"

		w := doJSON(t, srv, http.MethodPost, base, token, validClassifierBody())
		var c1 struct {
			ID int64 `json:"id"`
		}
		json.Unmarshal(w.Body.Bytes(), &c1)

		w = doJSON(t, srv, http.MethodPost, base, token, validClassifierBody())
		var c2 struct {
			ID int64 `json:"id"`
		}
		json.Unmarshal(w.Body.Bytes(), &c2)

		cid1 := strconv.FormatInt(c1.ID, 10)
		cid2 := strconv.FormatInt(c2.ID, 10)
		writeTestFile(t, storagePath+"/state_history/"+cid1+"/1.jpg")
		writeTestFile(t, storagePath+"/state_samples/"+cid1+"/aberto/1.jpg")
		writeTestFile(t, storagePath+"/state_history/"+cid2+"/1.jpg")
		writeTestFile(t, storagePath+"/state_samples/"+cid2+"/aberto/1.jpg")

		w = doJSON(t, srv, http.MethodDelete, base+"/"+cid1, token, nil)
		if w.Code != http.StatusNoContent {
			t.Fatalf("delete: %d %s", w.Code, w.Body.String())
		}

		if _, err := os.Stat(storagePath + "/state_history/" + cid1); !os.IsNotExist(err) {
			t.Error("state_history do classificador excluído deveria ter sido removido")
		}
		if _, err := os.Stat(storagePath + "/state_samples/" + cid1); !os.IsNotExist(err) {
			t.Error("state_samples do classificador excluído deveria ter sido removido")
		}
		if _, err := os.Stat(storagePath + "/state_history/" + cid2); err != nil {
			t.Errorf("state_history do OUTRO classificador não deveria ter sido afetado: %v", err)
		}
		if _, err := os.Stat(storagePath + "/state_samples/" + cid2); err != nil {
			t.Errorf("state_samples do OUTRO classificador não deveria ter sido afetado: %v", err)
		}
	})
}

func writeTestFile(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("data"), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestStateClassifierHistory(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
		t.Fatal(err)
	}
	cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://x/"}
	if _, err := db.CreateCamera(database, cam, nil); err != nil {
		t.Fatal(err)
	}
	cid, err := db.CreateStateClassifier(database, stateclass.Classifier{
		CameraID: "cam1", Name: "Portão", Model: "custom-cls", Threshold: 0.8,
		CropW: 0.3, CropH: 0.3, MinConsecutive: 1, Classes: []string{"aberto", "fechado"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.RecordStateTransition(database, cid, "aberto", 0.9, "/recordings/state_history/1/x.jpg"); err != nil {
		t.Fatal(err)
	}
	// gravação cobrindo "agora" → recording_available true
	now := time.Now().UTC()
	if err := db.InsertRecording(database, db.Recording{
		CameraID: "cam1", StartedAt: now.Add(-time.Hour), EndedAt: now.Add(time.Hour), Path: "cam1/rec.mp4",
	}); err != nil {
		t.Fatal(err)
	}

	srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "admin", "pw")
	path := "/api/cameras/cam1/classifiers/" + strconv.FormatInt(cid, 10) + "/history"
	w := doJSON(t, srv, http.MethodGet, path, token, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("history: %d %s", w.Code, w.Body.String())
	}
	var out []struct {
		State              string  `json:"state"`
		Confidence         float64 `json:"confidence"`
		Frame              string  `json:"frame"`
		RecordingAvailable bool    `json:"recording_available"`
	}
	json.Unmarshal(w.Body.Bytes(), &out)
	if len(out) != 1 {
		t.Fatalf("esperava 1 entrada, got %d: %s", len(out), w.Body.String())
	}
	if out[0].State != "aberto" || out[0].Frame != "/recordings/state_history/1/x.jpg" || !out[0].RecordingAvailable {
		t.Fatalf("entrada inesperada: %+v", out[0])
	}
}

func TestClassifierTrain(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
		t.Fatal(err)
	}
	cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://x/"}
	if _, err := db.CreateCamera(database, cam, nil); err != nil {
		t.Fatal(err)
	}

	// mock do serviço YOLO — captura o nome do modelo de destino do treino
	var gotModel string
	yolo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model string `json:"model"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		gotModel = body.Model
		json.NewEncoder(w).Encode(map[string]string{"job_id": "j1"})
	}))
	defer yolo.Close()
	// CA3: state classification resolve a URL do serviço YOLO através do
	// trainer configurado (analysis.state_trainer_id → trainers.service_url)
	// — não mais um campo direto em video_analysis_config.
	trainerID, err := db.InsertTrainer(database, "YOLO principal", "yolo", map[string]string{"service_url": yolo.URL})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.SetStateClassificationTrainerID(database, &trainerID); err != nil {
		t.Fatal(err)
	}

	srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).
		WithDB(database).
		WithStorageConfig(config.StorageConfig{Path: t.TempDir()})
	token := loginAndGetToken(t, srv, "admin", "pw")

	w := doJSON(t, srv, http.MethodPost, "/api/settings/cameras/cam1/classifiers", token, validClassifierBody())
	var created struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(w.Body.Bytes(), &created)
	trainPath := "/api/settings/cameras/cam1/classifiers/" + strconv.FormatInt(created.ID, 10) + "/train"

	jpeg := base64.StdEncoding.EncodeToString([]byte("fake"))
	t.Run("CA3: treino usa a URL do trainer configurado pra state classification", func(t *testing.T) {
		w = doJSON(t, srv, http.MethodPost, trainPath, token, map[string]any{
			"samples": []map[string]string{
				{"label": "fechado", "image_b64": jpeg},
				{"label": "aberto", "image_b64": jpeg},
			},
		})
		if w.Code != http.StatusOK {
			t.Fatalf("train: expected 200, got %d: %s", w.Code, w.Body.String())
		}
		var resp struct {
			JobID string `json:"job_id"`
		}
		json.Unmarshal(w.Body.Bytes(), &resp)
		if resp.JobID != "j1" {
			t.Fatalf("expected job_id j1, got %q", resp.JobID)
		}
		// treino deve mirar o modelo DESTE classificador (não o compartilhado)
		wantModel := "custom-cls-" + strconv.FormatInt(created.ID, 10)
		if gotModel != wantModel {
			t.Fatalf("expected train model %q, got %q", wantModel, gotModel)
		}
	})

	// < 2 classes → 400
	w = doJSON(t, srv, http.MethodPost, trainPath, token, map[string]any{
		"samples": []map[string]string{{"label": "fechado", "image_b64": jpeg}},
	})
	if w.Code != http.StatusBadRequest {
		t.Fatalf("train com 1 classe: expected 400, got %d", w.Code)
	}
}

// realJPEGBase64 devolve um JPEG sólido wxh em base64 (sem prefixo data:).
func realJPEGBase64(t *testing.T, w, h int) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: 180, G: 90, B: 40, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes())
}

// Treinar da lista: POST /train SEM samples treina a partir das amostras
// persistidas (frames inteiros recortados server-side).
func TestClassifierTrainFromStoredSamples(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
		t.Fatal(err)
	}
	cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://x/"}
	if _, err := db.CreateCamera(database, cam, nil); err != nil {
		t.Fatal(err)
	}

	var gotModel string
	var gotSamples int
	yolo := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model   string `json:"model"`
			Samples []struct {
				ImagePath string `json:"image_path"`
				Label     string `json:"label"`
			} `json:"samples"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		gotModel = body.Model
		gotSamples = len(body.Samples)
		json.NewEncoder(w).Encode(map[string]string{"job_id": "j2"})
	}))
	defer yolo.Close()
	// CA3: mesmo mecanismo de resolução via trainer que TestClassifierTrain.
	trainerID, err := db.InsertTrainer(database, "YOLO principal", "yolo", map[string]string{"service_url": yolo.URL})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.SetStateClassificationTrainerID(database, &trainerID); err != nil {
		t.Fatal(err)
	}

	srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).
		WithDB(database).
		WithStorageConfig(config.StorageConfig{Path: t.TempDir()})
	token := loginAndGetToken(t, srv, "admin", "pw")

	w := doJSON(t, srv, http.MethodPost, "/api/settings/cameras/cam1/classifiers", token, validClassifierBody())
	var created struct {
		ID int64 `json:"id"`
	}
	json.Unmarshal(w.Body.Bytes(), &created)
	base := "/api/settings/cameras/cam1/classifiers/" + strconv.FormatInt(created.ID, 10)

	// persiste amostras (frames inteiros) das 2 classes
	jpg := realJPEGBase64(t, 100, 100)
	w = doJSON(t, srv, http.MethodPost, base+"/samples", token, map[string]any{
		"samples": []map[string]string{
			{"label": "aberto", "image_b64": jpg},
			{"label": "aberto", "image_b64": jpg},
			{"label": "fechado", "image_b64": jpg},
		},
	})
	if w.Code != http.StatusNoContent && w.Code != http.StatusOK {
		t.Fatalf("salvar amostras: %d %s", w.Code, w.Body.String())
	}

	// treina SEM corpo → usa as amostras persistidas
	w = doJSON(t, srv, http.MethodPost, base+"/train", token, map[string]any{})
	if w.Code != http.StatusOK {
		t.Fatalf("train sem samples: expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		JobID string `json:"job_id"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp.JobID != "j2" {
		t.Fatalf("expected job_id j2, got %q", resp.JobID)
	}
	if gotModel != "custom-cls-"+strconv.FormatInt(created.ID, 10) {
		t.Fatalf("modelo de destino errado: %q", gotModel)
	}
	if gotSamples != 3 {
		t.Fatalf("esperava 3 amostras recortadas no treino, got %d", gotSamples)
	}
}
