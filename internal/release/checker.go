package release

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/mod/semver"
)

// DefaultDownloadBase é o diretório (redirect /latest/download do GitHub
// Releases) onde ficam os binários da última release ESTÁVEL — só usado hoje
// como fallback caso o checker nunca tenha resolvido uma release de verdade
// (nenhum Check bem-sucedido ainda). Uma vez resolvida uma release via
// DefaultReleasesAPIURL, DownloadBase() passa a refletir a base real
// daquela release específica (estável ou pré-release), não mais este atalho.
const DefaultDownloadBase = "https://github.com/jacksonbicalho/os-camera/releases/latest/download/"

// DefaultReleasesAPIURL é a API REST de releases do repositório — ao
// contrário do atalho estático /releases/latest (que nunca resolve
// pré-release), a lista inclui releases de qualquer tipo, cada uma com seu
// próprio tag_name/created_at/assets. É a única forma de descobrir "a
// release mais recente publicada, de qualquer tipo" sem um atalho dedicado
// do GitHub pra isso.
const DefaultReleasesAPIURL = "https://api.github.com/repos/jacksonbicalho/os-camera/releases"

// Status é um snapshot do estado da checagem, seguro para serializar.
type Status struct {
	Current         string    `json:"current"`
	Latest          string    `json:"latest"`
	NotesMD         string    `json:"notes_md"`
	Image           string    `json:"image"`
	UpdateAvailable bool      `json:"update_available"`
	CheckedAt       time.Time `json:"checked_at"`
	Err             string    `json:"error"`
}

// ghAsset é um asset de uma release na resposta da API REST do GitHub —
// só os campos que o checker consome.
type ghAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// ghRelease é uma entrada da resposta de DefaultReleasesAPIURL — só os
// campos que o checker consome (a API devolve bem mais).
type ghRelease struct {
	TagName    string    `json:"tag_name"`
	Prerelease bool      `json:"prerelease"`
	Draft      bool      `json:"draft"`
	CreatedAt  time.Time `json:"created_at"`
	Assets     []ghAsset `json:"assets"`
}

// Checker busca periodicamente o manifesto remoto e cacheia o resultado.
// O valor zero não é utilizável; use NewChecker.
type Checker struct {
	url     string
	current string
	client  *http.Client

	// OnCheck, se definido, é chamado ao fim de cada Check com o snapshot
	// resultante (consumidor decide o que fazer — ex.: notificar). Definir antes
	// de iniciar Run; nil = no-op.
	OnCheck func(Status)

	// CurrentBuiltAt é o timestamp de build (RFC3339) do binário em execução —
	// mesmo valor exposto em GET /api/about. Usado como desempate quando a
	// release mais recente tem a MESMA versão semver da instalada (tag
	// flutuante de RC recortada de novo sem bump de versão, ver
	// scripts/release-candidate.sh): se a release candidata foi criada DEPOIS
	// deste build, há atualização mesmo sem mudança na string de versão.
	// Zero-value seguro: string vazia = sem desempate (comportamento
	// equivalente a só comparar semver).
	CurrentBuiltAt string

	mu                   sync.RWMutex
	last                 Manifest
	downloadBase         string
	lastReleaseCreatedAt time.Time
	checkedAt            time.Time
	lastErr              error
}

// NewChecker cria um Checker. client nil usa um http.Client com timeout de 10s.
func NewChecker(url, current string, client *http.Client) *Checker {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &Checker{url: url, current: current, client: client}
}

// Check busca e parseia o manifesto, atualizando o cache (inclusive o erro em
// caso de falha) e retornando o resultado.
func (c *Checker) Check(ctx context.Context) (Manifest, error) {
	m, base, createdAt, err := c.fetch(ctx)

	c.mu.Lock()
	c.checkedAt = time.Now()
	c.lastErr = err
	if err == nil {
		c.last = m
		c.downloadBase = base
		c.lastReleaseCreatedAt = createdAt
	}
	c.mu.Unlock()

	if c.OnCheck != nil {
		c.OnCheck(c.Status())
	}

	return m, err
}

// fetch resolve a release mais recente publicada (de qualquer tipo — a
// escolha de "atualizar ou não" cabe a updateAvailable, não a este método),
// busca o version.json anexado a ELA especificamente (via browser_download_url
// do próprio asset, nunca uma URL adivinhada por convenção) e devolve o
// manifesto decodificado junto com a base de download dessa release.
func (c *Checker) fetch(ctx context.Context) (Manifest, string, time.Time, error) {
	releases, err := c.fetchReleaseList(ctx)
	if err != nil {
		return Manifest{}, "", time.Time{}, err
	}
	latest, ok := newestRelease(releases)
	if !ok {
		return Manifest{}, "", time.Time{}, fmt.Errorf("nenhuma release publicada encontrada")
	}
	asset, ok := findAsset(latest, "version.json")
	if !ok {
		return Manifest{}, "", time.Time{}, fmt.Errorf("release %s não tem version.json", latest.TagName)
	}

	body, err := c.getJSON(ctx, asset.BrowserDownloadURL)
	if err != nil {
		return Manifest{}, "", time.Time{}, fmt.Errorf("buscar manifesto de %s: %w", latest.TagName, err)
	}
	var m Manifest
	if err := json.Unmarshal(body, &m); err != nil {
		return Manifest{}, "", time.Time{}, fmt.Errorf("decodificar manifesto: %w", err)
	}

	base := strings.TrimSuffix(asset.BrowserDownloadURL, "version.json")
	return m, base, latest.CreatedAt, nil
}

func (c *Checker) fetchReleaseList(ctx context.Context) ([]ghRelease, error) {
	body, err := c.getJSON(ctx, c.url)
	if err != nil {
		return nil, fmt.Errorf("buscar lista de releases: %w", err)
	}
	var releases []ghRelease
	if err := json.Unmarshal(body, &releases); err != nil {
		return nil, fmt.Errorf("decodificar lista de releases: %w", err)
	}
	return releases, nil
}

func (c *Checker) getJSON(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("montar request: %w", err)
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// newestRelease escolhe, dentre releases publicadas (ignora draft — nunca
// deve ser instalável), a de maior CreatedAt. Não confia na ordenação da API
// (não documentada como garantia) — compara explicitamente.
func newestRelease(releases []ghRelease) (ghRelease, bool) {
	var best ghRelease
	found := false
	for _, r := range releases {
		if r.Draft {
			continue
		}
		if !found || r.CreatedAt.After(best.CreatedAt) {
			best = r
			found = true
		}
	}
	return best, found
}

func findAsset(r ghRelease, name string) (ghAsset, bool) {
	for _, a := range r.Assets {
		if a.Name == name {
			return a, true
		}
	}
	return ghAsset{}, false
}

// Manifest devolve o manifesto cacheado e se há um válido (ok=false antes de um
// check bem-sucedido).
func (c *Checker) Manifest() (Manifest, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.last, c.last.Latest != ""
}

// DownloadBase devolve a base de download (URL terminada em "/") da release
// resolvida no último Check bem-sucedido — usada pelo updater pra baixar o
// binário do lugar certo (a release que foi de fato detectada como "latest",
// que pode não ser a estável). Vazio antes do 1º check bem-sucedido.
func (c *Checker) DownloadBase() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.downloadBase
}

// Status devolve um snapshot do cache.
func (c *Checker) Status() Status {
	c.mu.RLock()
	defer c.mu.RUnlock()

	st := Status{
		Current:   c.current,
		Latest:    c.last.Latest,
		NotesMD:   c.last.NotesMD,
		Image:     c.last.Image,
		CheckedAt: c.checkedAt,
	}
	st.UpdateAvailable = updateAvailable(c.current, c.last.Latest, c.CurrentBuiltAt, c.lastReleaseCreatedAt)
	if c.lastErr != nil {
		st.Err = c.lastErr.Error()
	}
	return st
}

// Run checa uma vez na subida e depois a cada interval, até ctx ser cancelado.
// Erros de rede são resilientes: ficam no cache, sem derrubar a goroutine.
func (c *Checker) Run(ctx context.Context, interval time.Duration) {
	c.Check(ctx)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.Check(ctx)
		}
	}
}

// updateAvailable é true quando current e latest são semver válidos e latest
// é estritamente maior, OU quando são a MESMA versão mas latestCreatedAt é
// posterior a currentBuiltAt (tag flutuante de RC recortada de novo sem
// bump — ver CurrentBuiltAt). O desempate só entra em jogo quando os dois
// timestamps são parseáveis (RFC3339); ausência de qualquer um dos dois
// (string vazia, formato inesperado) só desativa o desempate, nunca gera
// erro — mesmo espírito "resiliente" do resto do checker.
func updateAvailable(current, latest, currentBuiltAt string, latestCreatedAt time.Time) bool {
	if !semver.IsValid(current) || !semver.IsValid(latest) {
		return false
	}
	switch semver.Compare(latest, current) {
	case 1:
		return true
	case 0:
		built, err := time.Parse(time.RFC3339, currentBuiltAt)
		if err != nil || latestCreatedAt.IsZero() {
			return false
		}
		return latestCreatedAt.After(built)
	default:
		return false
	}
}
