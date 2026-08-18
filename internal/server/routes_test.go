package server_test

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

// TestClassifierRoutesRemoved cobre a história chore/remover-classificacao-estados-backend
// — as rotas de classificador de estado saem da tabela de routes.go; uma request pra
// qualquer uma delas passa a cair no 404 padrão do http.ServeMux ("404 page not found",
// nunca registrado), não mais no handler JSON antigo (que hoje devolve 200/400/204/503
// conforme o caso, nunca esse texto exato). Usa um classificador real (raw SQL, sem
// depender de db.CreateStateClassifier/stateclass — ainda válidos nesta ordem da história,
// mas removidos num ticket posterior) pra garantir que a resposta ATUAL de cada rota seja
// distinguível da resposta pós-remoção mesmo nos casos que hoje também devolvem 404 por
// lógica de negócio (ex.: handleClassifierGet chama http.NotFound pra id inexistente).
func TestClassifierRoutesRemoved(t *testing.T) {
	t.Run("CA2: rotas de classificador de estado removidas — toda request cai no 404 padrão do mux (rota nunca registrada)", func(t *testing.T) {
		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
			t.Fatal(err)
		}
		cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://x/"}
		if _, err := db.CreateCamera(database, cam, nil); err != nil {
			t.Fatal(err)
		}
		res, err := database.Exec(
			`INSERT INTO camera_state_classifiers (camera_id, name, crop_x, crop_y, crop_w, crop_h) VALUES (?, ?, ?, ?, ?, ?)`,
			"cam1", "Portão", 0.1, 0.1, 0.3, 0.3,
		)
		if err != nil {
			t.Fatalf("insert classifier: %v", err)
		}
		cid, _ := res.LastInsertId()
		cidStr := strconv.FormatInt(cid, 10)

		srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).WithDB(database)
		token := loginAndGetToken(t, srv, "admin", "pw")

		removed := []struct {
			method string
			path   string
		}{
			{http.MethodGet, "/api/settings/classifiers/" + cidStr},
			{http.MethodGet, "/api/settings/cameras/cam1/classifiers"},
			{http.MethodPut, "/api/settings/cameras/cam1/classifiers/" + cidStr},
			{http.MethodDelete, "/api/settings/cameras/cam1/classifiers/" + cidStr},
			{http.MethodGet, "/api/settings/cameras/cam1/classifiers/" + cidStr + "/samples"},
			{http.MethodGet, "/api/cameras/cam1/classifiers/" + cidStr + "/state"},
			{http.MethodGet, "/api/cameras/cam1/classifiers/" + cidStr + "/history"},
			{http.MethodGet, "/api/me/footer-states"},
		}
		for _, r := range removed {
			req := httptest.NewRequest(r.method, r.path, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			srv.ServeHTTP(w, req)
			if w.Code != http.StatusNotFound || w.Body.String() != "404 page not found\n" {
				t.Errorf("%s %s: esperado 404 padrão do mux (rota removida), got status %d body %q",
					r.method, r.path, w.Code, w.Body.String())
			}
		}
	})
}
