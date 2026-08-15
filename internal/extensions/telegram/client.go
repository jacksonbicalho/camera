// Package telegram is a minimal client for the Telegram Bot API, plus the
// account-linking poller (Poller, história feat/telegram-vinculo-conta) —
// started by cmd/camera/main.go whenever a bot token is configured. Wired
// into internal/notifications/telegram.Sender since história
// feat/telegram-motion-notify (T2/T6) — this package only talks HTTP to the
// Bot API; who gets notified and with what content is resolved by the
// caller.
package telegram

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/url"
)

// apiBaseURL is a seam over the real Telegram Bot API host so tests can
// point Client at an httptest.Server fake — same idiom as
// internal/email's sendMail seam (internal/email/email.go).
var apiBaseURL = "https://api.telegram.org"

// StubAPIBase replaces the Telegram API base URL for tests and returns a
// function that restores the real one. Exported for this package's own
// tests.
func StubAPIBase(url string) (restore func()) {
	original := apiBaseURL
	apiBaseURL = url
	return func() { apiBaseURL = original }
}

// Client talks to the Telegram Bot API for a single bot token.
type Client struct {
	botToken   string
	httpClient *http.Client
}

// NewClient returns a Client authenticated with the given bot token.
func NewClient(botToken string) *Client {
	return &Client{botToken: botToken, httpClient: &http.Client{}}
}

func (c *Client) endpoint(method string) string {
	return fmt.Sprintf("%s/bot%s/%s", apiBaseURL, c.botToken, method)
}

// SendMessage sends a plain-text message to the given chat.
func (c *Client) SendMessage(chatID, text string) error {
	resp, err := c.httpClient.PostForm(c.endpoint("sendMessage"), url.Values{
		"chat_id": {chatID},
		"text":    {text},
	})
	if err != nil {
		return fmt.Errorf("telegram: send message: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram: send message: unexpected status %d", resp.StatusCode)
	}
	return nil
}

// SendPhoto sends a photo (JPEG bytes) with an optional caption to the given
// chat, via multipart/form-data (the Bot API's sendMessage-style form
// encoding doesn't support file uploads).
func (c *Client) SendPhoto(chatID string, photo []byte, caption string) error {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	if err := w.WriteField("chat_id", chatID); err != nil {
		return fmt.Errorf("telegram: send photo: write chat_id: %w", err)
	}
	if err := w.WriteField("caption", caption); err != nil {
		return fmt.Errorf("telegram: send photo: write caption: %w", err)
	}
	part, err := w.CreateFormFile("photo", "snapshot.jpg")
	if err != nil {
		return fmt.Errorf("telegram: send photo: create photo part: %w", err)
	}
	if _, err := part.Write(photo); err != nil {
		return fmt.Errorf("telegram: send photo: write photo part: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("telegram: send photo: close writer: %w", err)
	}

	resp, err := c.httpClient.Post(c.endpoint("sendPhoto"), w.FormDataContentType(), &body)
	if err != nil {
		return fmt.Errorf("telegram: send photo: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram: send photo: unexpected status %d", resp.StatusCode)
	}
	return nil
}

type getMeResponse struct {
	OK     bool `json:"ok"`
	Result struct {
		Username string `json:"username"`
	} `json:"result"`
}

// GetMe returns the bot's own @username, resolved from the Bot API.
func (c *Client) GetMe() (string, error) {
	resp, err := c.httpClient.Get(c.endpoint("getMe"))
	if err != nil {
		return "", fmt.Errorf("telegram: get me: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("telegram: get me: unexpected status %d", resp.StatusCode)
	}
	var body getMeResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("telegram: get me: decode response: %w", err)
	}
	if !body.OK {
		return "", fmt.Errorf("telegram: get me: API returned ok=false")
	}
	return body.Result.Username, nil
}
