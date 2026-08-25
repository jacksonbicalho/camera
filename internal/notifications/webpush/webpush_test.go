package webpush_test

import (
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"testing"

	"camera/internal/db"
	"camera/internal/notifications"
	"camera/internal/notifications/webpush"

	webpushgo "github.com/SherClockHolmes/webpush-go"
)

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	dir := t.TempDir()
	database, err := db.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

// CA3: o Sender envia pra todas as subscriptions do destinatário e remove a
// subscription quando o serviço de push responde 404/410.
func TestSenderSend(t *testing.T) {
	t.Run("CA3: envia pra todas as subscriptions do usuário, sem tocar nas de outro usuário", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		otherUID, err := db.CreateUser(database, "u2", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create other user: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/phone", "p1", "a1"); err != nil {
			t.Fatalf("upsert phone: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/desktop", "p2", "a2"); err != nil {
			t.Fatalf("upsert desktop: %v", err)
		}
		if err := db.UpsertPushSubscription(database, otherUID, "https://push.example/other", "p3", "a3"); err != nil {
			t.Fatalf("upsert other user: %v", err)
		}

		var sentTo []string
		var sentPayloads [][]byte
		sender := webpush.New(database, "vapid-pub", "vapid-priv",
			func(message []byte, s *webpushgo.Subscription, options *webpushgo.Options) (*http.Response, error) {
				sentTo = append(sentTo, s.Endpoint)
				sentPayloads = append(sentPayloads, message)
				return &http.Response{StatusCode: http.StatusCreated, Body: io.NopCloser(nil)}, nil
			},
		)

		err = sender.Send(notifications.Notification{
			Title: "Movimento detectado", Message: "Câmera da sala · 92.3%", Link: "/recording/cam1/1/2",
		}, uid)
		if err != nil {
			t.Fatalf("Send: %v", err)
		}

		if len(sentTo) != 2 {
			t.Fatalf("esperava 2 envios (só do uid), foram %d: %v", len(sentTo), sentTo)
		}
		for _, ep := range sentTo {
			if ep == "https://push.example/other" {
				t.Error("não deveria enviar pra subscription de outro usuário")
			}
		}

		var p struct {
			Title string `json:"title"`
			Body  string `json:"body"`
			Link  string `json:"link"`
		}
		if err := json.Unmarshal(sentPayloads[0], &p); err != nil {
			t.Fatalf("payload não é JSON válido: %v", err)
		}
		if p.Title != "Movimento detectado" || p.Body != "Câmera da sala · 92.3%" || p.Link != "/recording/cam1/1/2" {
			t.Errorf("payload = %+v", p)
		}
	})

	t.Run("CA3: 410 Gone remove a subscription; outras do mesmo usuário continuam recebendo", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/expired", "p1", "a1"); err != nil {
			t.Fatalf("upsert expired: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/valid", "p2", "a2"); err != nil {
			t.Fatalf("upsert valid: %v", err)
		}

		sender := webpush.New(database, "vapid-pub", "vapid-priv",
			func(message []byte, s *webpushgo.Subscription, options *webpushgo.Options) (*http.Response, error) {
				status := http.StatusCreated
				if s.Endpoint == "https://push.example/expired" {
					status = http.StatusGone
				}
				return &http.Response{StatusCode: status, Body: io.NopCloser(nil)}, nil
			},
		)

		if err := sender.Send(notifications.Notification{Title: "t", Message: "m"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}

		subs, err := db.ListPushSubscriptionsForUser(database, uid)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 1 || subs[0].Endpoint != "https://push.example/valid" {
			t.Fatalf("subs após 410 = %+v, esperava só a válida sobrar", subs)
		}
	})

	t.Run("CA3: usuário sem subscription — no-op, sem erro", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		called := false
		sender := webpush.New(database, "vapid-pub", "vapid-priv",
			func(message []byte, s *webpushgo.Subscription, options *webpushgo.Options) (*http.Response, error) {
				called = true
				return &http.Response{StatusCode: http.StatusCreated, Body: io.NopCloser(nil)}, nil
			},
		)
		if err := sender.Send(notifications.Notification{Title: "t", Message: "m"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
		if called {
			t.Error("send não deveria ser chamado sem subscription")
		}
	})

	t.Run("CA3: send nil (VAPID indisponível) — no-op, sem panic", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/x", "p", "a"); err != nil {
			t.Fatalf("upsert: %v", err)
		}
		sender := webpush.New(database, "", "", nil)
		if err := sender.Send(notifications.Notification{Title: "t", Message: "m"}, uid); err != nil {
			t.Fatalf("Send: %v", err)
		}
	})
}

// CA3: GetOrCreateVAPIDKeys gera uma vez e devolve as mesmas chaves em
// chamadas subsequentes (estabilidade entre reinícios — trocar a chave
// invalidaria toda subscription existente).
func TestGetOrCreateVAPIDKeys(t *testing.T) {
	t.Run("CA3: gera na primeira chamada, reaproveita nas seguintes", func(t *testing.T) {
		database := openTestDB(t)

		pub1, priv1, err := webpush.GetOrCreateVAPIDKeys(database)
		if err != nil {
			t.Fatalf("1ª chamada: %v", err)
		}
		if pub1 == "" || priv1 == "" {
			t.Fatalf("chaves vazias: pub=%q priv=%q", pub1, priv1)
		}

		pub2, priv2, err := webpush.GetOrCreateVAPIDKeys(database)
		if err != nil {
			t.Fatalf("2ª chamada: %v", err)
		}
		if pub2 != pub1 || priv2 != priv1 {
			t.Errorf("chaves divergiram entre chamadas: (%q,%q) != (%q,%q)", pub1, priv1, pub2, priv2)
		}
	})
}
