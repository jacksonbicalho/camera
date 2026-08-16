package telegram_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"camera/internal/extensions/telegram"
)

func TestParseStartCommand(t *testing.T) {
	t.Run("CA5: reconhece /start <código> e extrai o código", func(t *testing.T) {
		code, ok := telegram.ParseStartCommand("/start abc123")
		if !ok || code != "abc123" {
			t.Errorf("expected ok=true code='abc123', got ok=%v code=%q", ok, code)
		}
	})

	t.Run("CA5: texto que não é /start não é reconhecido", func(t *testing.T) {
		if _, ok := telegram.ParseStartCommand("oi"); ok {
			t.Error("expected ok=false for non-/start text")
		}
	})

	t.Run("CA5: /start sem código não é reconhecido", func(t *testing.T) {
		if _, ok := telegram.ParseStartCommand("/start"); ok {
			t.Error("expected ok=false for /start without a code")
		}
	})

	t.Run("CA5: /start seguido só de espaços (prefixo bate, código vazio após trim) não é reconhecido", func(t *testing.T) {
		if _, ok := telegram.ParseStartCommand("/start   "); ok {
			t.Error("expected ok=false for /start followed by only whitespace")
		}
	})
}

type fakeResolver struct {
	resolvedUserID int64
	resolvedOK     bool
	gotUserID      int64
	gotChatID      string
	gotUsername    string
	gotFirstName   string
	gotLastName    string
	clearedUserID  int64
	cleared        bool
}

func (f *fakeResolver) ResolveLinkCode(code string) (int64, bool) {
	return f.resolvedUserID, f.resolvedOK
}

func (f *fakeResolver) SetChatInfo(userID int64, chatID, username, firstName, lastName string) error {
	f.gotUserID, f.gotChatID = userID, chatID
	f.gotUsername, f.gotFirstName, f.gotLastName = username, firstName, lastName
	return nil
}

func (f *fakeResolver) ClearLinkCode(userID int64) error {
	f.clearedUserID, f.cleared = userID, true
	return nil
}

type fakePush struct {
	pushedUserID int64
	pushed       bool
}

func (f *fakePush) Push(userID int64) {
	f.pushedUserID, f.pushed = userID, true
}

func TestPollerHandleUpdate(t *testing.T) {
	t.Run("CA6: código válido persiste o chat_id e envia a mensagem de confirmação pro chat certo", func(t *testing.T) {
		var gotChatID, gotText string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_ = r.ParseForm()
			gotChatID = r.FormValue("chat_id")
			gotText = r.FormValue("text")
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		resolver := &fakeResolver{resolvedUserID: 42, resolvedOK: true}
		p := telegram.NewPoller(telegram.NewClient("TOK"), resolver, nil)

		u := telegram.Update{Message: telegram.Message{
			Chat: telegram.Chat{ID: 999},
			Text: "/start good-code",
			From: &telegram.From{ID: 999, Username: "janedoe", FirstName: "Jane", LastName: "Doe"},
		}}
		if err := p.HandleUpdate(u); err != nil {
			t.Fatalf("HandleUpdate: %v", err)
		}
		if resolver.gotUserID != 42 || resolver.gotChatID != "999" {
			t.Errorf("expected chat_id '999' persisted for user 42, got user=%d chat_id=%q", resolver.gotUserID, resolver.gotChatID)
		}
		if gotChatID != "999" || gotText == "" {
			t.Errorf("expected a confirmation message sent to chat 999, got chat_id=%q text=%q", gotChatID, gotText)
		}
		if !resolver.cleared || resolver.clearedUserID != 42 {
			t.Errorf("expected the link code to be cleared (single-use) for user 42, got cleared=%v for user=%d", resolver.cleared, resolver.clearedUserID)
		}
	})

	t.Run("CA2: código válido também persiste username/first_name/last_name do remetente do /start", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		resolver := &fakeResolver{resolvedUserID: 42, resolvedOK: true}
		p := telegram.NewPoller(telegram.NewClient("TOK"), resolver, nil)

		u := telegram.Update{Message: telegram.Message{
			Chat: telegram.Chat{ID: 999},
			Text: "/start good-code",
			From: &telegram.From{ID: 999, Username: "janedoe", FirstName: "Jane", LastName: "Doe"},
		}}
		if err := p.HandleUpdate(u); err != nil {
			t.Fatalf("HandleUpdate: %v", err)
		}
		if resolver.gotUsername != "janedoe" || resolver.gotFirstName != "Jane" || resolver.gotLastName != "Doe" {
			t.Errorf("expected username/first_name/last_name captured, got username=%q first=%q last=%q",
				resolver.gotUsername, resolver.gotFirstName, resolver.gotLastName)
		}
	})

	t.Run("CA2: From ausente não quebra — persiste chat_id com identidade vazia", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		resolver := &fakeResolver{resolvedUserID: 42, resolvedOK: true}
		p := telegram.NewPoller(telegram.NewClient("TOK"), resolver, nil)

		u := telegram.Update{Message: telegram.Message{Chat: telegram.Chat{ID: 999}, Text: "/start good-code"}}
		if err := p.HandleUpdate(u); err != nil {
			t.Fatalf("HandleUpdate: %v", err)
		}
		if resolver.gotChatID != "999" {
			t.Errorf("expected chat_id '999' still persisted without From, got %q", resolver.gotChatID)
		}
		if resolver.gotUsername != "" || resolver.gotFirstName != "" || resolver.gotLastName != "" {
			t.Errorf("expected empty identity fields when From is nil, got username=%q first=%q last=%q",
				resolver.gotUsername, resolver.gotFirstName, resolver.gotLastName)
		}
	})

	t.Run("CA6: código desconhecido/expirado não persiste chat_id nem envia mensagem", func(t *testing.T) {
		called := false
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		resolver := &fakeResolver{resolvedOK: false}
		p := telegram.NewPoller(telegram.NewClient("TOK"), resolver, nil)

		u := telegram.Update{Message: telegram.Message{Chat: telegram.Chat{ID: 111}, Text: "/start bad-code"}}
		if err := p.HandleUpdate(u); err != nil {
			t.Fatalf("HandleUpdate: %v", err)
		}
		if resolver.gotChatID != "" {
			t.Errorf("expected no chat_id persisted for an unresolved code, got %q", resolver.gotChatID)
		}
		if called {
			t.Error("expected no message sent for an unresolved code")
		}
	})

	t.Run("CA4: vínculo bem-sucedido chama Push(userID) no LivePush", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		resolver := &fakeResolver{resolvedUserID: 42, resolvedOK: true}
		push := &fakePush{}
		p := telegram.NewPoller(telegram.NewClient("TOK"), resolver, push)

		u := telegram.Update{Message: telegram.Message{Chat: telegram.Chat{ID: 999}, Text: "/start good-code"}}
		if err := p.HandleUpdate(u); err != nil {
			t.Fatalf("HandleUpdate: %v", err)
		}
		if !push.pushed || push.pushedUserID != 42 {
			t.Errorf("expected Push(42) after a successful link, got pushed=%v userID=%d", push.pushed, push.pushedUserID)
		}
	})

	t.Run("CA4: código desconhecido/expirado NÃO chama Push", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		resolver := &fakeResolver{resolvedOK: false}
		push := &fakePush{}
		p := telegram.NewPoller(telegram.NewClient("TOK"), resolver, push)

		u := telegram.Update{Message: telegram.Message{Chat: telegram.Chat{ID: 111}, Text: "/start bad-code"}}
		if err := p.HandleUpdate(u); err != nil {
			t.Fatalf("HandleUpdate: %v", err)
		}
		if push.pushed {
			t.Error("expected no Push for an unresolved code")
		}
	})

	t.Run("CA4: push nil não quebra (uso opcional)", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		resolver := &fakeResolver{resolvedUserID: 42, resolvedOK: true}
		p := telegram.NewPoller(telegram.NewClient("TOK"), resolver, nil)

		u := telegram.Update{Message: telegram.Message{Chat: telegram.Chat{ID: 999}, Text: "/start good-code"}}
		if err := p.HandleUpdate(u); err != nil {
			t.Fatalf("HandleUpdate with nil push: %v", err)
		}
	})
}

func TestClientGetUpdates(t *testing.T) {
	t.Run("envia offset/timeout como query params e parseia o resultado", func(t *testing.T) {
		var gotQuery string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotQuery = r.URL.RawQuery
			_, _ = w.Write([]byte(`{"ok":true,"result":[{"update_id":5,"message":{"chat":{"id":1},"text":"/start x"}}]}`))
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		c := telegram.NewClient("TOK")
		updates, err := c.GetUpdates(context.Background(), 3, 0)
		if err != nil {
			t.Fatalf("GetUpdates: %v", err)
		}
		if !strings.Contains(gotQuery, "offset=3") || !strings.Contains(gotQuery, "timeout=0") {
			t.Errorf("expected offset=3/timeout=0 in query, got %q", gotQuery)
		}
		if len(updates) != 1 || updates[0].UpdateID != 5 {
			t.Errorf("expected 1 update with id 5, got %+v", updates)
		}
	})

	t.Run("propaga erro quando a API responde ok=false", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(`{"ok":false}`))
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		c := telegram.NewClient("TOK")
		if _, err := c.GetUpdates(context.Background(), 0, 0); err == nil {
			t.Error("expected error for ok=false")
		}
	})

	t.Run("propaga erro quando a API responde status != 200", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusForbidden)
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		c := telegram.NewClient("TOK")
		if _, err := c.GetUpdates(context.Background(), 0, 0); err == nil {
			t.Error("expected error for status != 200")
		}
	})
}

// flakyResolver fails SetChatInfo exactly once (for the first call), then
// delegates to the embedded fakeResolver — simulates a transient error
// (e.g. a DB hiccup) to prove Run retries instead of dropping the update.
type flakyResolver struct {
	*fakeResolver
	failed bool
}

func (f *flakyResolver) SetChatInfo(userID int64, chatID, username, firstName, lastName string) error {
	if !f.failed {
		f.failed = true
		return fmt.Errorf("simulated transient failure")
	}
	return f.fakeResolver.SetChatInfo(userID, chatID, username, firstName, lastName)
}

func TestPollerRun(t *testing.T) {
	t.Run("uma falha transitória no processamento não avança o offset — o mesmo update é reentregue e reprocessado com sucesso", func(t *testing.T) {
		var calls int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !strings.HasSuffix(r.URL.Path, "/getUpdates") {
				// sendMessage (the confirmation) hits the same stub base —
				// only getUpdates calls count towards the offset assertions.
				w.WriteHeader(http.StatusOK)
				return
			}
			n := atomic.AddInt32(&calls, 1)
			offset := r.URL.Query().Get("offset")
			if n <= 2 {
				// A mesma update_id=5 nas 2 primeiras chamadas, com offset
				// continuando 0 — prova que a 1ª falha não avançou o ack.
				if offset != "0" {
					t.Errorf("call %d: expected offset=0 (update not yet acked), got %q", n, offset)
				}
				_, _ = w.Write([]byte(`{"ok":true,"result":[{"update_id":5,"message":{"chat":{"id":999},"text":"/start good-code"}}]}`))
				return
			}
			// A partir da 3ª chamada, o processamento já teve sucesso —
			// offset avançou pra 6 (update_id+1).
			if offset != "6" {
				t.Errorf("call %d: expected offset=6 (update acked after success), got %q", n, offset)
			}
			_, _ = w.Write([]byte(`{"ok":true,"result":[]}`))
		}))
		defer server.Close()
		defer telegram.StubAPIBase(server.URL)()

		resolver := &flakyResolver{fakeResolver: &fakeResolver{resolvedUserID: 7, resolvedOK: true}}
		p := telegram.NewPoller(telegram.NewClient("TOK"), resolver, nil)

		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			p.Run(ctx, nil, time.Millisecond)
			close(done)
		}()

		deadline := time.Now().Add(2 * time.Second)
		for atomic.LoadInt32(&calls) < 3 {
			if time.Now().After(deadline) {
				t.Fatal("timed out waiting for the poller to retry and re-ack past the failed update")
			}
			time.Sleep(time.Millisecond)
		}
		cancel()

		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatal("Run did not return after ctx cancellation")
		}

		if !resolver.cleared || resolver.clearedUserID != 7 {
			t.Errorf("expected the link code to be cleared after the retry succeeded, got cleared=%v user=%d", resolver.cleared, resolver.clearedUserID)
		}
	})
}
