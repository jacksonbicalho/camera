package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/notifications/application"
	"camera/internal/release"
	"camera/internal/server"
	"camera/internal/stateclass"
)

func TestNotificationsLiveRequiresAuth(t *testing.T) {
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	req := httptest.NewRequest(http.MethodGet, "/api/notifications/live", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// streamAndTrigger abre o SSE como o usuário do token, dispara `trigger` (que deve
// inserir+publicar) e devolve o corpo recebido antes de cancelar a conexão.
func streamAndTrigger(t *testing.T, srv *server.Server, token string, trigger func()) string {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/api/notifications/live?token="+token, nil).WithContext(ctx)
	w := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		defer close(done)
		srv.ServeHTTP(w, req)
	}()

	time.Sleep(20 * time.Millisecond) // deixa o handler subscrever
	trigger()
	time.Sleep(20 * time.Millisecond) // deixa o handler escrever o evento
	cancel()
	<-done
	return w.Body.String()
}

func TestNotificationsLiveStreamsOnUpdate(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "adm", "pw", "admin", false); err != nil {
		t.Fatal(err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
	srv.WithNotifications(notifications.NewDispatcher(discardLogger(), application.New(database, srv)))
	token := loginAndGetToken(t, srv, "adm", "pw")

	body := streamAndTrigger(t, srv, token, func() {
		srv.NotifyUpdateAvailable(release.Status{UpdateAvailable: true, Latest: "v9.9.9"})
	})
	if !strings.Contains(body, "data:") {
		t.Fatalf("SSE não emitiu evento no update; body=%q", body)
	}
}

func TestNotificationsLiveStreamsOnStateTransition(t *testing.T) {
	database := openServerTestDB(t)
	adminID, _ := db.CreateUser(database, "adm", "pw", "admin", false)
	cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://x/"}
	if _, err := db.CreateCamera(database, cam, nil); err != nil {
		t.Fatal(err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).WithDB(database)
	srv.WithNotifications(notifications.NewDispatcher(discardLogger(), application.New(database, srv)))
	token := loginAndGetToken(t, srv, "adm", "pw")

	body := streamAndTrigger(t, srv, token, func() {
		srv.PublishClassifierState(stateclass.Classifier{
			ID: 1, CameraID: "cam1", Name: "Portão",
			NotifyEnabled: true, NotifyUserIDs: []int64{adminID},
		}, "aberto", 0.9)
	})
	if !strings.Contains(body, "data:") {
		t.Fatalf("SSE não emitiu evento na transição de estado; body=%q", body)
	}
}
