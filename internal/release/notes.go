package release

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

// releaseByTagAPI é a API REST do GitHub (não o download estático usado pelo
// Checker) — só ela permite buscar uma release específica por tag, inclusive
// pré-releases (RC/beta/alpha), que /releases/latest nunca devolve.
const releaseByTagAPI = "https://api.github.com/repos/jacksonbicalho/os-camera/releases/tags/"

// NotesFetcher busca e cacheia (em memória, sem expiração — a versão instalada
// não muda sem reiniciar o processo) o changelog (campo "body") da release do
// GitHub cuja tag bate com a versão informada.
type NotesFetcher struct {
	client  *http.Client
	baseURL string

	mu    sync.Mutex
	cache map[string]notesResult
}

type notesResult struct {
	body string
	err  error
}

// NewNotesFetcher cria um NotesFetcher. client nil usa um http.Client com
// timeout de 10s.
func NewNotesFetcher(client *http.Client) *NotesFetcher {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &NotesFetcher{client: client, baseURL: releaseByTagAPI, cache: map[string]notesResult{}}
}

// Notes devolve o changelog da release cuja tag é "v"+version (prefixo "v" só
// é adicionado se ausente). Versões sem release correspondente no GitHub
// (builds de dev, ex. "v1.4.2-3-gabc123-dirty") devolvem erro — o chamador
// decide se omite a seção.
func (f *NotesFetcher) Notes(ctx context.Context, version string) (string, error) {
	tag := version
	if !strings.HasPrefix(tag, "v") {
		tag = "v" + tag
	}

	f.mu.Lock()
	if cached, ok := f.cache[tag]; ok {
		f.mu.Unlock()
		return cached.body, cached.err
	}
	f.mu.Unlock()

	body, err := f.fetch(ctx, tag)

	f.mu.Lock()
	f.cache[tag] = notesResult{body: body, err: err}
	f.mu.Unlock()

	return body, err
}

func (f *NotesFetcher) fetch(ctx context.Context, tag string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.baseURL+tag, nil)
	if err != nil {
		return "", fmt.Errorf("montar request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := f.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("buscar release %s: %w", tag, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("release %s: status %d", tag, resp.StatusCode)
	}
	var payload struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("decodificar release %s: %w", tag, err)
	}
	return payload.Body, nil
}
