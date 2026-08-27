package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

func postSelfTest(t *testing.T, srv http.Handler, token, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w
}

func TestTelegramTestNotify(t *testing.T) {
	t.Run("CA4: 409 quando o Telegram não está totalmente configurado (sem câmera habilitada)", func(t *testing.T) {
		database := openServerTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("set extension active: %v", err)
		}
		if err := db.SetUserTelegramChatInfo(database, uid, "12345", "", "", ""); err != nil {
			t.Fatalf("set chat id: %v", err)
		}
		sender := &fakeMotionSender{}
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
			WithDB(database).WithTelegramSender(sender)
		token := loginAndGetToken(t, srv, "u1", "pw")

		w := postSelfTest(t, srv, token, "/api/me/telegram/test")
		if w.Code != http.StatusConflict {
			t.Fatalf("status = %d, quero 409 (nenhuma câmera habilitada): %s", w.Code, w.Body.String())
		}
		if len(sender.notifs) != 0 {
			t.Error("Send não deveria ser chamado sem o gate completo")
		}
	})

	t.Run("CA4: envia via telegramSender quando tudo está habilitado", func(t *testing.T) {
		database := openServerTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("set extension active: %v", err)
		}
		if err := db.SetUserTelegramChatInfo(database, uid, "12345", "", "", ""); err != nil {
			t.Fatalf("set chat id: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam-1", true, 0.05); err != nil {
			t.Fatalf("set notify: %v", err)
		}
		sender := &fakeMotionSender{}
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
			WithDB(database).WithTelegramSender(sender)
		token := loginAndGetToken(t, srv, "u1", "pw")

		w := postSelfTest(t, srv, token, "/api/me/telegram/test")
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, quero 200: %s", w.Code, w.Body.String())
		}
		if len(sender.userIDs) != 1 || sender.userIDs[0] != uid {
			t.Fatalf("Send chamado com userIDs=%v, quero [%d]", sender.userIDs, uid)
		}
	})

	t.Run("CA4: 409 quando o gate passa mas o telegramSender não está configurado nesta instância", func(t *testing.T) {
		database := openServerTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.SetExtensionActive(database, "telegram", true); err != nil {
			t.Fatalf("set extension active: %v", err)
		}
		if err := db.SetUserTelegramChatInfo(database, uid, "12345", "", "", ""); err != nil {
			t.Fatalf("set chat id: %v", err)
		}
		if err := db.SetUserCameraMotionTelegramNotify(database, uid, "cam-1", true, 0.05); err != nil {
			t.Fatalf("set notify: %v", err)
		}
		// Sem WithTelegramSender — cenário real: extensão marcada ativa no
		// banco, mas o bot token não está configurado em camera.yaml
		// (cmd/camera/main.go só faz o wiring quando o token existe).
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
		token := loginAndGetToken(t, srv, "u1", "pw")

		w := postSelfTest(t, srv, token, "/api/me/telegram/test")
		if w.Code != http.StatusConflict {
			t.Fatalf("status = %d, quero 409 (sender não configurado): %s", w.Code, w.Body.String())
		}
	})

	t.Run("CA4: requer autenticação", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
		req := httptest.NewRequest(http.MethodPost, "/api/me/telegram/test", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, quero 401", w.Code)
		}
	})
}

func TestPushTestNotify(t *testing.T) {
	t.Run("CA4: 409 quando não há subscription salva", func(t *testing.T) {
		database := openServerTestDB(t)
		if _, err := db.CreateUser(database, "u1", "pw", "viewer", false); err != nil {
			t.Fatalf("create user: %v", err)
		}
		sender := &fakeMotionSender{}
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
			WithDB(database).WithWebpushSender(sender)
		token := loginAndGetToken(t, srv, "u1", "pw")

		w := postSelfTest(t, srv, token, "/api/me/push/test")
		if w.Code != http.StatusConflict {
			t.Fatalf("status = %d, quero 409 (sem subscription): %s", w.Code, w.Body.String())
		}
		if len(sender.notifs) != 0 {
			t.Error("Send não deveria ser chamado sem subscription")
		}
	})

	t.Run("CA4: envia via webpushSender quando há subscription salva", func(t *testing.T) {
		database := openServerTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/x", "p", "a"); err != nil {
			t.Fatalf("upsert subscription: %v", err)
		}
		sender := &fakeMotionSender{}
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
			WithDB(database).WithWebpushSender(sender)
		token := loginAndGetToken(t, srv, "u1", "pw")

		w := postSelfTest(t, srv, token, "/api/me/push/test")
		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, quero 200: %s", w.Code, w.Body.String())
		}
		if len(sender.userIDs) != 1 || sender.userIDs[0] != uid {
			t.Fatalf("Send chamado com userIDs=%v, quero [%d]", sender.userIDs, uid)
		}
		if sender.notifs[0].Title == "" || sender.notifs[0].Message == "" {
			t.Errorf("notificação de teste sem título/mensagem: %+v", sender.notifs[0])
		}
	})

	t.Run("CA4: 409 quando o gate passa mas o webpushSender não está configurado nesta instância", func(t *testing.T) {
		database := openServerTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/x", "p", "a"); err != nil {
			t.Fatalf("upsert subscription: %v", err)
		}
		// Sem WithWebpushSender — cenário real: as chaves VAPID falharam ao
		// gerar no boot (ver internal/notifications/webpush.GetOrCreateVAPIDKeys).
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
		token := loginAndGetToken(t, srv, "u1", "pw")

		w := postSelfTest(t, srv, token, "/api/me/push/test")
		if w.Code != http.StatusConflict {
			t.Fatalf("status = %d, quero 409 (sender não configurado): %s", w.Code, w.Body.String())
		}
	})

	t.Run("CA4: requer autenticação", func(t *testing.T) {
		srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
		req := httptest.NewRequest(http.MethodPost, "/api/me/push/test", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, quero 401", w.Code)
		}
	})
}
