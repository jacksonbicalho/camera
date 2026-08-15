package telegram_test

import (
	"encoding/json"
	"io"
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

	t.Run("CA7: SendPhoto envia chat_id, caption e o arquivo pro endpoint sendPhoto do bot", func(t *testing.T) {
		t.Run("envia multipart/form-data com os 3 campos", func(t *testing.T) {
			var gotPath, gotChatID, gotCaption string
			var gotPhotoBytes []byte
			var gotFilename string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				if err := r.ParseMultipartForm(10 << 20); err != nil {
					t.Errorf("ParseMultipartForm: %v", err)
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				gotChatID = r.FormValue("chat_id")
				gotCaption = r.FormValue("caption")
				file, header, err := r.FormFile("photo")
				if err != nil {
					t.Errorf("FormFile(photo): %v", err)
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				defer file.Close()
				gotFilename = header.Filename
				gotPhotoBytes, _ = io.ReadAll(file)
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()
			defer telegram.StubAPIBase(server.URL)()

			c := telegram.NewClient("TESTTOKEN")
			photoBytes := []byte("fake-jpeg-bytes")
			if err := c.SendPhoto("12345", photoBytes, "Movimento detectado"); err != nil {
				t.Fatalf("SendPhoto: %v", err)
			}
			if gotPath != "/botTESTTOKEN/sendPhoto" {
				t.Errorf("path = %q, want /botTESTTOKEN/sendPhoto", gotPath)
			}
			if gotChatID != "12345" {
				t.Errorf("chat_id = %q, want 12345", gotChatID)
			}
			if gotCaption != "Movimento detectado" {
				t.Errorf("caption = %q, want %q", gotCaption, "Movimento detectado")
			}
			if string(gotPhotoBytes) != "fake-jpeg-bytes" {
				t.Errorf("photo bytes = %q, want %q", gotPhotoBytes, "fake-jpeg-bytes")
			}
			if gotFilename == "" {
				t.Error("expected a non-empty filename for the photo part")
			}
		})

		t.Run("propaga erro quando a API responde status != 200", func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusForbidden)
			}))
			defer server.Close()
			defer telegram.StubAPIBase(server.URL)()

			c := telegram.NewClient("TESTTOKEN")
			if err := c.SendPhoto("12345", []byte("x"), "caption"); err == nil {
				t.Fatal("expected error, got nil")
			}
		})
	})

	t.Run("CA9: SendMessageHTML/SendPhotoHTML enviam parse_mode=HTML (link clicável)", func(t *testing.T) {
		t.Run("SendMessageHTML envia parse_mode=HTML junto de chat_id/text", func(t *testing.T) {
			var gotParseMode string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = r.ParseForm()
				gotParseMode = r.FormValue("parse_mode")
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()
			defer telegram.StubAPIBase(server.URL)()

			c := telegram.NewClient("TESTTOKEN")
			if err := c.SendMessageHTML("12345", `<a href="http://x">link</a>`); err != nil {
				t.Fatalf("SendMessageHTML: %v", err)
			}
			if gotParseMode != "HTML" {
				t.Errorf("parse_mode = %q, want HTML", gotParseMode)
			}
		})

		t.Run("SendPhotoHTML envia parse_mode=HTML junto do multipart", func(t *testing.T) {
			var gotParseMode string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if err := r.ParseMultipartForm(10 << 20); err != nil {
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				gotParseMode = r.FormValue("parse_mode")
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()
			defer telegram.StubAPIBase(server.URL)()

			c := telegram.NewClient("TESTTOKEN")
			if err := c.SendPhotoHTML("12345", []byte("x"), `<a href="http://x">link</a>`); err != nil {
				t.Fatalf("SendPhotoHTML: %v", err)
			}
			if gotParseMode != "HTML" {
				t.Errorf("parse_mode = %q, want HTML", gotParseMode)
			}
		})

		t.Run("SendMessage/SendPhoto originais continuam sem parse_mode (não quebram o poller de vínculo)", func(t *testing.T) {
			var gotParseMode string
			var sawParseModeKey bool
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_ = r.ParseForm()
				_, sawParseModeKey = r.Form["parse_mode"]
				gotParseMode = r.FormValue("parse_mode")
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()
			defer telegram.StubAPIBase(server.URL)()

			c := telegram.NewClient("TESTTOKEN")
			if err := c.SendMessage("12345", "plain text"); err != nil {
				t.Fatalf("SendMessage: %v", err)
			}
			if sawParseModeKey || gotParseMode != "" {
				t.Errorf("expected no parse_mode field on plain SendMessage, got %q", gotParseMode)
			}
		})
	})
}
