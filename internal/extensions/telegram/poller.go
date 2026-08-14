package telegram

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Update is one incoming Telegram Bot API update, as returned by
// getUpdates. Only the fields the account-linking flow needs.
type Update struct {
	UpdateID int64   `json:"update_id"`
	Message  Message `json:"message"`
}

// Message is the message payload of an Update.
type Message struct {
	Chat Chat   `json:"chat"`
	Text string `json:"text"`
}

// Chat identifies the Telegram chat a message came from — its ID is what
// SendMessage needs as chat_id to reply.
type Chat struct {
	ID int64 `json:"id"`
}

type getUpdatesResponse struct {
	OK     bool     `json:"ok"`
	Result []Update `json:"result"`
}

// GetUpdates polls the Bot API for new updates since offset (Telegram's
// getUpdates long-polling contract: passing the last update_id+1 as offset
// acks it and returns only newer ones). timeout (seconds) asks the API to
// hold the connection open until an update arrives or it elapses — the
// caller (Poller's loop) picks the value; 0 disables long-polling (returns
// immediately), useful for tests. ctx bounds the whole (potentially
// long-blocking) call, so a cancelled Run doesn't hang shutdown waiting on
// a stuck connection.
func (c *Client) GetUpdates(ctx context.Context, offset int64, timeoutSeconds int) ([]Update, error) {
	q := url.Values{
		"offset":  {strconv.FormatInt(offset, 10)},
		"timeout": {strconv.Itoa(timeoutSeconds)},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint("getUpdates")+"?"+q.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("telegram: get updates: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("telegram: get updates: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("telegram: get updates: unexpected status %d", resp.StatusCode)
	}
	var body getUpdatesResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("telegram: get updates: decode response: %w", err)
	}
	if !body.OK {
		return nil, fmt.Errorf("telegram: get updates: API returned ok=false")
	}
	return body.Result, nil
}

// ParseStartCommand extracts the linking code from a Telegram message text
// like "/start abc123" (what the deep-link t.me/<bot>?start=<code> makes
// the Telegram app send automatically). ok=false for anything else.
func ParseStartCommand(text string) (code string, ok bool) {
	const prefix = "/start "
	if !strings.HasPrefix(text, prefix) {
		return "", false
	}
	code = strings.TrimSpace(text[len(prefix):])
	if code == "" {
		return "", false
	}
	return code, true
}

// LinkResolver is how Poller resolves a pending link code back to a user
// and persists the result — satisfied by internal/db's telegram.go
// functions (T1) on the caller side. Defined here (consumer side, per
// convenção do projeto) since Poller is what calls it.
type LinkResolver interface {
	ResolveLinkCode(code string) (userID int64, ok bool)
	SetChatID(userID int64, chatID string) error
	// ClearLinkCode invalidates the code after a successful link — single-use:
	// without this, a leaked/observed code stays valid until it expires and
	// could re-link (hijack) the same user's chat_id from a different chat.
	ClearLinkCode(userID int64) error
}

// Poller drives the account-linking flow: HandleUpdate processes one
// incoming Update, and a caller (main.go, T3) loops GetUpdates → HandleUpdate
// with backoff, mirroring recorder.Run(ctx, reconnect).
type Poller struct {
	client   *Client
	resolver LinkResolver
}

// NewPoller builds a Poller for the given Client/LinkResolver.
func NewPoller(client *Client, resolver LinkResolver) *Poller {
	return &Poller{client: client, resolver: resolver}
}

// HandleUpdate processes one Update: a valid "/start <code>" resolves the
// code, persists the chat_id, and replies with a confirmation message.
// Anything else (not a /start, unknown/expired code) is a no-op.
func (p *Poller) HandleUpdate(u Update) error {
	code, ok := ParseStartCommand(u.Message.Text)
	if !ok {
		return nil
	}
	userID, ok := p.resolver.ResolveLinkCode(code)
	if !ok {
		return nil
	}
	chatID := strconv.FormatInt(u.Message.Chat.ID, 10)
	if err := p.resolver.SetChatID(userID, chatID); err != nil {
		return err
	}
	// Single-use: consume the code now that it linked successfully, so it
	// can't be replayed from a different chat before it would've expired.
	if err := p.resolver.ClearLinkCode(userID); err != nil {
		return err
	}
	return p.client.SendMessage(chatID, "Conta vinculada! Você vai receber notificações por aqui.")
}

// getUpdatesTimeoutSeconds is how long each GetUpdates call blocks
// server-side waiting for a new update before returning empty — Telegram's
// long-polling contract. It's what paces the loop below; no extra sleep is
// needed between successful polls.
const getUpdatesTimeoutSeconds = 30

// Run polls the Bot API in a loop until ctx is cancelled, dispatching every
// update to HandleUpdate. A failed poll (network blip, API hiccup) is
// logged and retried after backoff — mirrors recorder.Run(ctx, reconnect).
func (p *Poller) Run(ctx context.Context, log *slog.Logger, backoff time.Duration) {
	var offset int64
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		updates, err := p.client.GetUpdates(ctx, offset, getUpdatesTimeoutSeconds)
		if err != nil {
			if log != nil {
				log.Warn("telegram: poller: getUpdates failed", "error", err)
			}
			if !sleepOrDone(ctx, backoff) {
				return
			}
			continue
		}
		failed := false
		for _, u := range updates {
			// Advance the offset (Telegram's ack — it never resends an acked
			// update) only AFTER HandleUpdate succeeds: acking first and
			// failing after would drop a /start <code> forever on a
			// transient error (DB hiccup), with no way to recover it. On
			// failure, stop processing this batch (the rest is retried, safe
			// due to HandleUpdate's own idempotency via the single-use code)
			// and back off — Telegram redelivers a pending, un-acked update
			// immediately with no server-side delay, so without this a
			// persistent failure (e.g. DB down) would hammer the Bot API in
			// a tight loop.
			if err := p.HandleUpdate(u); err != nil {
				if log != nil {
					log.Warn("telegram: poller: handle update failed, will retry", "update_id", u.UpdateID, "error", err)
				}
				failed = true
				break
			}
			if u.UpdateID >= offset {
				offset = u.UpdateID + 1
			}
		}
		if failed && !sleepOrDone(ctx, backoff) {
			return
		}
	}
}

// sleepOrDone waits for backoff or ctx cancellation, whichever comes first.
// Returns false when ctx won — the caller should stop.
func sleepOrDone(ctx context.Context, backoff time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(backoff):
		return true
	}
}
