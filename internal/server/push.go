package server

import (
	"encoding/json"
	"net/http"

	"camera/internal/db"
	"camera/internal/notifications/webpush"
)

// handleGetPushVAPIDPublicKey devolve a chave pública VAPID da instância —
// gerada (e persistida) no primeiro uso via webpush.GetOrCreateVAPIDKeys,
// nunca regenerada depois (ao contrário do segredo JWT): trocar a chave
// invalidaria toda subscription já registrada. O frontend usa isso como
// applicationServerKey em PushManager.subscribe().
func (s *Server) handleGetPushVAPIDPublicKey(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	public, _, err := webpush.GetOrCreateVAPIDKeys(s.db)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"public_key": public})
}

type pushSubscriptionBody struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// handleSubscribePush registra (ou atualiza, se o endpoint já existia — ex.:
// o navegador rotacionou as chaves) uma subscription pro usuário
// autenticado. O objeto do corpo é exatamente o que PushSubscription.toJSON()
// do navegador produz.
func (s *Server) handleSubscribePush(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	var body pushSubscriptionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" || body.Keys.P256dh == "" || body.Keys.Auth == "" {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	userID := s.currentUserID(r)
	if err := db.UpsertPushSubscription(s.db, userID, body.Endpoint, body.Keys.P256dh, body.Keys.Auth); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

type pushUnsubscribeBody struct {
	Endpoint string `json:"endpoint"`
}

// handleUnsubscribePush remove a subscription do usuário autenticado —
// escopado por user_id (DeletePushSubscriptionForUser), pra um usuário não
// conseguir remover a subscription de outro só sabendo/reusando o endpoint.
func (s *Server) handleUnsubscribePush(w http.ResponseWriter, r *http.Request) {
	if !s.requireDB(w) {
		return
	}
	var body pushUnsubscribeBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := db.DeletePushSubscriptionForUser(s.db, s.currentUserID(r), body.Endpoint); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}
