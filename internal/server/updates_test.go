package server_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"camera/internal/config"
	"camera/internal/release"
	"camera/internal/server"
)

type fakeChecker struct{ st release.Status }

func (f fakeChecker) Status() release.Status             { return f.st }
func (f fakeChecker) Manifest() (release.Manifest, bool) { return release.Manifest{}, false }

type fakeNotesFetcher struct {
	notes map[string]string
}

func (f fakeNotesFetcher) Notes(ctx context.Context, version string) (string, error) {
	if notes, ok := f.notes[version]; ok {
		return notes, nil
	}
	return "", errors.New("release não encontrada")
}

func TestGetUpdates_WithChecker(t *testing.T) {
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	srv = withTestUsersAndCameras(t, srv, nil)
	srv.WithUpdateChecker(fakeChecker{st: release.Status{
		Current:         "v1.3.0-dev",
		Latest:          "v1.4.0-dev",
		NotesMD:         "### Novidades\n- algo",
		Image:           "jacksonbicalho/os-camera:1.4.0-dev",
		UpdateAvailable: true,
	}})
	token := loginAndGetToken(t, srv, "admin", "pw")

	req := httptest.NewRequest(http.MethodGet, "/api/updates", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	var st release.Status
	if err := json.Unmarshal(w.Body.Bytes(), &st); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if !st.UpdateAvailable || st.Latest != "v1.4.0-dev" || st.Image == "" {
		t.Errorf("status inesperado: %+v", st)
	}
}

func TestGetAbout_IncludesReleaseNotesForExactInstalledVersion(t *testing.T) {
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
		WithVersion("v0.15.0-rc")
	srv = withTestUsersAndCameras(t, srv, nil)
	// updateChecker aponta pra "latest" (uma versão estável mais antiga — a API
	// do GitHub nunca resolve pré-release como latest); releaseNotesFetcher é
	// quem resolve a nota da RC rodando de verdade.
	srv.WithUpdateChecker(fakeChecker{st: release.Status{
		Current: "v0.15.0-rc",
		Latest:  "v0.14.1-dev",
		NotesMD: "### Correções\n- notas da v0.14.1, NÃO da versão rodando",
	}})
	srv.WithReleaseNotesFetcher(fakeNotesFetcher{notes: map[string]string{
		"v0.15.0-rc": "### Novidades\n- algo da própria RC",
	}})
	token := loginAndGetToken(t, srv, "admin", "pw")

	req := httptest.NewRequest(http.MethodGet, "/api/about", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		ReleaseNotesVersion string `json:"release_notes_version"`
		ReleaseNotesMD      string `json:"release_notes_md"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.ReleaseNotesVersion != "v0.15.0-rc" || resp.ReleaseNotesMD != "### Novidades\n- algo da própria RC" {
		t.Errorf("release notes inesperadas (deveriam ser da versão instalada, não da latest): %+v", resp)
	}
}

func TestGetAbout_NoFetcher_OmitsReleaseNotes(t *testing.T) {
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	srv = withTestUsersAndCameras(t, srv, nil)
	token := loginAndGetToken(t, srv, "admin", "pw")

	req := httptest.NewRequest(http.MethodGet, "/api/about", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := resp["release_notes_md"]; ok {
		t.Errorf("release_notes_md não deveria aparecer sem releaseNotesFetcher: %+v", resp)
	}
}

func TestGetAbout_FetcherError_OmitsReleaseNotes(t *testing.T) {
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
		WithVersion("v1.4.2-3-gabc123-dirty")
	srv = withTestUsersAndCameras(t, srv, nil)
	srv.WithReleaseNotesFetcher(fakeNotesFetcher{notes: map[string]string{}})
	token := loginAndGetToken(t, srv, "admin", "pw")

	req := httptest.NewRequest(http.MethodGet, "/api/about", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := resp["release_notes_md"]; ok {
		t.Errorf("release_notes_md não deveria aparecer quando o fetcher erra (build de dev): %+v", resp)
	}
}

func TestGetUpdates_ApplyMode(t *testing.T) {
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	srv = withTestUsersAndCameras(t, srv, nil)
	srv.WithApplyMode("self-replace")
	token := loginAndGetToken(t, srv, "admin", "pw")

	req := httptest.NewRequest(http.MethodGet, "/api/updates", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		ApplyMode string `json:"apply_mode"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.ApplyMode != "self-replace" {
		t.Errorf("apply_mode = %q, quero self-replace", resp.ApplyMode)
	}
}

func TestGetUpdates_NoChecker(t *testing.T) {
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	srv = withTestUsersAndCameras(t, srv, nil)
	srv.WithVersion("v1.3.0-dev")
	token := loginAndGetToken(t, srv, "admin", "pw")

	req := httptest.NewRequest(http.MethodGet, "/api/updates", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	var st release.Status
	json.Unmarshal(w.Body.Bytes(), &st)
	if st.UpdateAvailable {
		t.Error("sem checker não deveria haver update")
	}
	if st.Current != "v1.3.0-dev" {
		t.Errorf("Current = %q, quero v1.3.0-dev", st.Current)
	}
}
