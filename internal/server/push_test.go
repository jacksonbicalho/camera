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

func pushTestServer(t *testing.T) (*server.Server, string, int64, *db.DB) {
	t.Helper()
	database := openServerTestDB(t)
	uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "u1", "pw")
	return srv, token, uid, database
}

func getVAPIDPublicKey(t *testing.T, srv http.Handler, token string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/me/push/vapid-public-key", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET vapid-public-key: status %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		PublicKey string `json:"public_key"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return body.PublicKey
}

// CA4: POST /api/me/push/subscription persiste, GET vapid-public-key devolve
// a mesma chave em chamadas repetidas, DELETE remove.
func TestPushEndpoints(t *testing.T) {
	t.Run("CA4: GET vapid-public-key devolve a mesma chave em chamadas repetidas (gerada uma vez)", func(t *testing.T) {
		srv, token, _, _ := pushTestServer(t)

		key1 := getVAPIDPublicKey(t, srv, token)
		if key1 == "" {
			t.Fatal("chave pública vazia")
		}
		key2 := getVAPIDPublicKey(t, srv, token)
		if key2 != key1 {
			t.Errorf("chave divergiu entre chamadas: %q != %q", key1, key2)
		}
	})

	t.Run("CA4: sem token de autenticação, GET vapid-public-key devolve 401", func(t *testing.T) {
		srv, _, _, _ := pushTestServer(t)
		req := httptest.NewRequest(http.MethodGet, "/api/me/push/vapid-public-key", nil)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, quero 401", w.Code)
		}
	})

	t.Run("CA4: POST subscription persiste (round-trip confirmado via db.ListPushSubscriptionsForUser)", func(t *testing.T) {
		srv, token, uid, database := pushTestServer(t)

		body := `{"endpoint":"https://push.example/ep1","keys":{"p256dh":"p-key","auth":"a-key"}}`
		req := httptest.NewRequest(http.MethodPost, "/api/me/push/subscription", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("POST subscription: status %d: %s", w.Code, w.Body.String())
		}

		subs, err := db.ListPushSubscriptionsForUser(database, uid)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 1 || subs[0].Endpoint != "https://push.example/ep1" || subs[0].P256dh != "p-key" || subs[0].Auth != "a-key" {
			t.Fatalf("subs = %+v", subs)
		}
	})

	t.Run("CA4: POST subscription com corpo inválido devolve 400", func(t *testing.T) {
		srv, token, _, _ := pushTestServer(t)
		req := httptest.NewRequest(http.MethodPost, "/api/me/push/subscription", strings.NewReader(`{"endpoint":""}`))
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, quero 400", w.Code)
		}
	})

	t.Run("CA4: DELETE subscription remove a subscription do usuário autenticado", func(t *testing.T) {
		srv, token, uid, database := pushTestServer(t)

		postBody := `{"endpoint":"https://push.example/ep2","keys":{"p256dh":"p","auth":"a"}}`
		reqPost := httptest.NewRequest(http.MethodPost, "/api/me/push/subscription", strings.NewReader(postBody))
		reqPost.Header.Set("Authorization", "Bearer "+token)
		wPost := httptest.NewRecorder()
		srv.ServeHTTP(wPost, reqPost)
		if wPost.Code != http.StatusOK {
			t.Fatalf("POST: status %d", wPost.Code)
		}

		delBody := `{"endpoint":"https://push.example/ep2"}`
		reqDel := httptest.NewRequest(http.MethodDelete, "/api/me/push/subscription", strings.NewReader(delBody))
		reqDel.Header.Set("Authorization", "Bearer "+token)
		wDel := httptest.NewRecorder()
		srv.ServeHTTP(wDel, reqDel)
		if wDel.Code != http.StatusOK {
			t.Fatalf("DELETE: status %d: %s", wDel.Code, wDel.Body.String())
		}

		subs, err := db.ListPushSubscriptionsForUser(database, uid)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 0 {
			t.Errorf("esperava 0 subscriptions após DELETE, tem %+v", subs)
		}
	})

	t.Run("CA4: DELETE não remove subscription de outro usuário", func(t *testing.T) {
		srv, _, _, database := pushTestServer(t)
		otherUID, err := db.CreateUser(database, "u2", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create other user: %v", err)
		}
		if err := db.UpsertPushSubscription(database, otherUID, "https://push.example/other", "p", "a"); err != nil {
			t.Fatalf("upsert: %v", err)
		}
		token := loginAndGetToken(t, srv, "u1", "pw")

		delBody := `{"endpoint":"https://push.example/other"}`
		req := httptest.NewRequest(http.MethodDelete, "/api/me/push/subscription", strings.NewReader(delBody))
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("DELETE: status %d", w.Code)
		}

		subs, err := db.ListPushSubscriptionsForUser(database, otherUID)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 1 {
			t.Errorf("subscription de outro usuário foi removida indevidamente: %+v", subs)
		}
	})
}
