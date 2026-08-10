// Package telegram is a minimal client for the Telegram Bot API. It is a
// standalone building block for the future "extensions" system — not wired
// into internal/notifications and not started automatically by
// cmd/camera/main.go yet (see work_progress/analysis, história futura liga
// isso a um listener de vínculo de conta e ao envio de notificações reais).
package telegram

import (
	"encoding/json"
	"fmt"
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
