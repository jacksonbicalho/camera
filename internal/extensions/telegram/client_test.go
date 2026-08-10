package telegram_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/extensions/telegram"
)

func TestClient(t *testing.T) {
	t.Run("CA2: SendMessage envia a requisição correta e propaga erro em falha HTTP", func(t *testing.T) {
		t.Run("envia chat_id e text pro endpoint sendMessage do bot", func(t *testing.T) {
			var gotPath, gotChatID, gotText string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				_ = r.ParseForm()
				gotChatID = r.FormValue("chat_id")
				gotText = r.FormValue("text")
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()
			defer telegram.StubAPIBase(server.URL)()

			c := telegram.NewClient("TESTTOKEN")
			if err := c.SendMessage("12345", "hello"); err != nil {
				t.Fatalf("SendMessage: %v", err)
			}
			if gotPath != "/botTESTTOKEN/sendMessage" {
				t.Errorf("path = %q, want /botTESTTOKEN/sendMessage", gotPath)
			}
			if gotChatID != "12345" || gotText != "hello" {
				t.Errorf("chat_id/text = %q/%q, want 12345/hello", gotChatID, gotText)
			}
		})

		t.Run("propaga erro quando a API responde status != 200", func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusForbidden)
			}))
			defer server.Close()
			defer telegram.StubAPIBase(server.URL)()

			c := telegram.NewClient("TESTTOKEN")
			if err := c.SendMessage("12345", "hello"); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	})

	t.Run("CA3: GetMe retorna o username a partir da resposta da API", func(t *testing.T) {
		t.Run("resolve o username do bot autenticado", func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"ok":     true,
					"result": map[string]any{"username": "os_camera_bot"},
				})
			}))
			defer server.Close()
			defer telegram.StubAPIBase(server.URL)()

			c := telegram.NewClient("TESTTOKEN")
			username, err := c.GetMe()
			if err != nil {
				t.Fatalf("GetMe: %v", err)
			}
			if username != "os_camera_bot" {
				t.Errorf("username = %q, want os_camera_bot", username)
			}
		})

		t.Run("erro quando a API responde ok=false", func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{"ok": false})
			}))
			defer server.Close()
			defer telegram.StubAPIBase(server.URL)()

			c := telegram.NewClient("TESTTOKEN")
			if _, err := c.GetMe(); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	})
}
