package server_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/release"
	"camera/internal/server"
)

type checkerWithManifest struct {
	st   release.Status
	man  release.Manifest
	ok   bool
	base string
}

func (c checkerWithManifest) Status() release.Status             { return c.st }
func (c checkerWithManifest) Manifest() (release.Manifest, bool) { return c.man, c.ok }
func (c checkerWithManifest) DownloadBase() string               { return c.base }

type appliedCall struct {
	manifest release.Manifest
	baseURL  string
}

type fakeApplier struct{ called chan appliedCall }

func (f fakeApplier) Apply(ctx context.Context, m release.Manifest, baseURL string) error {
	f.called <- appliedCall{manifest: m, baseURL: baseURL}
	return nil
}

func applyTestServer(t *testing.T, mode string, available bool) (http.Handler, string, chan appliedCall) {
	t.Helper()
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	srv = withTestUsersAndCameras(t, srv, nil)
	srv.WithApplyMode(mode)
	srv.WithUpdateChecker(checkerWithManifest{
		st:   release.Status{Current: "v1.3.0-dev", Latest: "v1.4.0-dev", UpdateAvailable: available},
		man:  release.Manifest{Latest: "v1.4.0-dev"},
		ok:   true,
		base: "https://github.com/jacksonbicalho/os-camera/releases/download/v1.4.0-dev/",
	})
	called := make(chan appliedCall, 1)
	srv.WithApplier(fakeApplier{called: called})
	token := loginAndGetToken(t, srv, "admin", "pw")
	return srv, token, called
}

func TestApplyUpdate_SelfReplace(t *testing.T) {
	srv, token, called := applyTestServer(t, "self-replace", true)

	req := httptest.NewRequest(http.MethodPost, "/api/updates/apply", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	select {
	case c := <-called:
		if c.manifest.Latest != "v1.4.0-dev" {
			t.Errorf("manifesto aplicado = %q", c.manifest.Latest)
		}
		// CA3: a base passada pro applier é a que o checker resolveu pra
		// essa release específica, não um atalho fixo pra "latest" estável.
		if want := "https://github.com/jacksonbicalho/os-camera/releases/download/v1.4.0-dev/"; c.baseURL != want {
			t.Errorf("baseURL = %q, quero %q (a resolvida pelo checker)", c.baseURL, want)
		}
	case <-time.After(time.Second):
		t.Error("Apply não foi chamado")
	}
}

func TestApplyUpdate_DockerRejected(t *testing.T) {
	srv, token, called := applyTestServer(t, "docker", true)

	req := httptest.NewRequest(http.MethodPost, "/api/updates/apply", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, quero 409", w.Code)
	}
	select {
	case <-called:
		t.Error("Apply não deveria ser chamado no modo docker")
	case <-time.After(100 * time.Millisecond):
	}
}

func TestApplyUpdate_NoUpdate(t *testing.T) {
	srv, token, called := applyTestServer(t, "self-replace", false)

	req := httptest.NewRequest(http.MethodPost, "/api/updates/apply", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, quero 409", w.Code)
	}
	select {
	case <-called:
		t.Error("Apply não deveria ser chamado sem update")
	case <-time.After(100 * time.Millisecond):
	}
}
