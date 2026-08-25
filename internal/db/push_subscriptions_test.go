package db_test

import (
	"testing"

	"camera/internal/db"
)

// CA2: Upsert/List/Delete de push_subscriptions fazem round-trip correto e
// upsert por endpoint não duplica.
func TestPushSubscriptions(t *testing.T) {
	t.Run("CA2: upsert insere, list devolve, e assinar de novo o mesmo endpoint atualiza em vez de duplicar", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}

		if err := db.UpsertPushSubscription(database, uid, "https://push.example/ep1", "p256dh-1", "auth-1"); err != nil {
			t.Fatalf("upsert: %v", err)
		}
		subs, err := db.ListPushSubscriptionsForUser(database, uid)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 1 || subs[0].Endpoint != "https://push.example/ep1" || subs[0].P256dh != "p256dh-1" || subs[0].Auth != "auth-1" {
			t.Fatalf("subs = %+v", subs)
		}

		// Mesmo endpoint, chaves novas (ex.: navegador rotacionou as chaves) —
		// deve atualizar a linha existente, não criar uma segunda.
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/ep1", "p256dh-2", "auth-2"); err != nil {
			t.Fatalf("upsert de novo: %v", err)
		}
		subs, err = db.ListPushSubscriptionsForUser(database, uid)
		if err != nil {
			t.Fatalf("list após 2º upsert: %v", err)
		}
		if len(subs) != 1 {
			t.Fatalf("esperava 1 subscription (upsert, não duplicata), tem %d: %+v", len(subs), subs)
		}
		if subs[0].P256dh != "p256dh-2" || subs[0].Auth != "auth-2" {
			t.Errorf("chaves não atualizaram: %+v", subs[0])
		}
	})

	t.Run("CA2: um usuário pode ter várias subscriptions (um dispositivo cada)", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}

		if err := db.UpsertPushSubscription(database, uid, "https://push.example/phone", "p256dh-phone", "auth-phone"); err != nil {
			t.Fatalf("upsert phone: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/desktop", "p256dh-desktop", "auth-desktop"); err != nil {
			t.Fatalf("upsert desktop: %v", err)
		}
		subs, err := db.ListPushSubscriptionsForUser(database, uid)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 2 {
			t.Fatalf("esperava 2 subscriptions, tem %d", len(subs))
		}
	})

	t.Run("CA2: delete por endpoint remove só aquela subscription", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/a", "p", "a"); err != nil {
			t.Fatalf("upsert a: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/b", "p", "a"); err != nil {
			t.Fatalf("upsert b: %v", err)
		}

		if err := db.DeletePushSubscriptionByEndpoint(database, "https://push.example/a"); err != nil {
			t.Fatalf("delete: %v", err)
		}
		subs, err := db.ListPushSubscriptionsForUser(database, uid)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 1 || subs[0].Endpoint != "https://push.example/b" {
			t.Fatalf("subs após delete = %+v", subs)
		}
	})

	t.Run("CA2: delete escopado por usuário remove a própria subscription do usuário", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if err := db.UpsertPushSubscription(database, uid, "https://push.example/mine", "p", "a"); err != nil {
			t.Fatalf("upsert: %v", err)
		}

		if err := db.DeletePushSubscriptionForUser(database, uid, "https://push.example/mine"); err != nil {
			t.Fatalf("delete: %v", err)
		}
		subs, err := db.ListPushSubscriptionsForUser(database, uid)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 0 {
			t.Fatalf("esperava a própria subscription removida, subs = %+v", subs)
		}
	})

	t.Run("CA2: delete escopado por usuário não remove subscription de outro usuário", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		otherUID, err := db.CreateUser(database, "u2", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create other user: %v", err)
		}
		if err := db.UpsertPushSubscription(database, otherUID, "https://push.example/other", "p", "a"); err != nil {
			t.Fatalf("upsert: %v", err)
		}

		if err := db.DeletePushSubscriptionForUser(database, uid, "https://push.example/other"); err != nil {
			t.Fatalf("delete: %v", err)
		}
		subs, err := db.ListPushSubscriptionsForUser(database, otherUID)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 1 {
			t.Fatalf("subscription de outro usuário foi removida indevidamente: %+v", subs)
		}
	})

	t.Run("CA2: lista vazia pra usuário sem subscription", func(t *testing.T) {
		database := openTestDB(t)
		uid, err := db.CreateUser(database, "u1", "pw", "viewer", false)
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		subs, err := db.ListPushSubscriptionsForUser(database, uid)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if len(subs) != 0 {
			t.Errorf("esperava lista vazia, tem %+v", subs)
		}
	})
}
