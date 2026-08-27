package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/events"
	"camera/internal/server"
)

func TestUpdateApplyLiveRequiresAuth(t *testing.T) {
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	req := httptest.NewRequest(http.MethodGet, "/api/updates/apply/live", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

// streamUpdateLive abre o SSE de progresso do apply autenticado, dispara
// `trigger` (que deve publicar no bus) e devolve o corpo recebido antes de
// cancelar a conexão. Mesmo padrão de streamAndTrigger
// (notifications_live_test.go), sem o roteamento por user_id — só um apply
// roda por vez, não há necessidade de isolar por usuário.
func streamUpdateLive(t *testing.T, srv *server.Server, token string, trigger func()) string {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/api/updates/apply/live?token="+token, nil).WithContext(ctx)
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

func TestUpdateApplyLive(t *testing.T) {
	t.Run("CA3: transmite os steps de progresso publicados no events.Bus", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
		srv = withTestUsersAndCameras(t, srv, nil)
		bus := events.NewBus()
		srv.WithEvents(bus)
		token := loginAndGetToken(t, srv, "admin", "pw")

		body := streamUpdateLive(t, srv, token, func() {
			bus.Publish(events.Event{Type: server.EventUpdateStep, Data: "downloading", At: time.Now()})
		})
		if !strings.Contains(body, "downloading") {
			t.Fatalf("SSE não emitiu o step publicado; body=%q", body)
		}
	})

	t.Run("CA3: transmite o evento de falha (EventUpdateFailed) no mesmo stream", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
		srv = withTestUsersAndCameras(t, srv, nil)
		bus := events.NewBus()
		srv.WithEvents(bus)
		token := loginAndGetToken(t, srv, "admin", "pw")

		body := streamUpdateLive(t, srv, token, func() {
			bus.Publish(events.Event{Type: server.EventUpdateFailed, Data: "checksum inválido", At: time.Now()})
		})
		if !strings.Contains(body, "checksum inválido") {
			t.Fatalf("SSE não repassou a mensagem real do erro; body=%q", body)
		}
	})
}
