package server_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/events"
	"camera/internal/release"
	"camera/internal/server"
)

// checkerWithManifest.Check devolve sempre man/nil — os 3 testes que o usam
// (SelfReplace/DockerRejected/NoUpdate) só variam st.UpdateAvailable, nunca
// simulam recheck (ver recheckChecker abaixo pra isso, história
// fix/apply-update-recheck-fresco).
type checkerWithManifest struct {
	st   release.Status
	man  release.Manifest
	base string
}

func (c checkerWithManifest) Status() release.Status { return c.st }
func (c checkerWithManifest) Check(ctx context.Context) (release.Manifest, error) {
	return c.man, nil
}
func (c checkerWithManifest) DownloadBase() string { return c.base }

// recheckChecker simula a diferença entre o status CACHEADO (staleSt, o que
// Status() devolveria antes de qualquer recheck) e o status FRESCO
// (freshSt, o que um Check() bem-sucedido revela) — o cenário do incidente
// de produção: a tag -rc foi republicada depois do último check periódico
// do Run, e só um recheck síncrono no clique de "Atualizar agora" enxerga
// isso (história fix/apply-update-recheck-fresco).
type recheckChecker struct {
	staleSt    release.Status
	freshSt    release.Status
	manifest   release.Manifest
	base       string
	checkErr   error
	checkCalls int
}

func (f *recheckChecker) Status() release.Status {
	if f.checkCalls > 0 {
		return f.freshSt
	}
	return f.staleSt
}

func (f *recheckChecker) DownloadBase() string { return f.base }

func (f *recheckChecker) Check(ctx context.Context) (release.Manifest, error) {
	f.checkCalls++
	if f.checkErr != nil {
		return release.Manifest{}, f.checkErr
	}
	return f.manifest, nil
}

type appliedCall struct {
	manifest release.Manifest
	baseURL  string
}

// fakeApplier.err (história fix/apply-update-recheck-fresco) simula uma
// falha de Apply (ex.: checksum mismatch) — zero value nil preserva o
// comportamento original (sempre sucesso) pros 3 testes que não o setam.
type fakeApplier struct {
	called chan appliedCall
	err    error
}

func (f fakeApplier) Apply(ctx context.Context, m release.Manifest, baseURL string) error {
	f.called <- appliedCall{manifest: m, baseURL: baseURL}
	return f.err
}

func applyTestServer(t *testing.T, mode string, available bool) (http.Handler, string, chan appliedCall) {
	t.Helper()
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	srv = withTestUsersAndCameras(t, srv, nil)
	srv.WithApplyMode(mode)
	srv.WithUpdateChecker(checkerWithManifest{
		st:   release.Status{Current: "v1.3.0-dev", Latest: "v1.4.0-dev", UpdateAvailable: available},
		man:  release.Manifest{Latest: "v1.4.0-dev"},
		base: "https://github.com/jacksonbicalho/os-camera/releases/download/v1.4.0-dev/",
	})
	called := make(chan appliedCall, 1)
	srv.WithApplier(fakeApplier{called: called})
	token := loginAndGetToken(t, srv, "admin", "pw")
	return srv, token, called
}

func newRecheckTestServer(t *testing.T, checker *recheckChecker, applier fakeApplier, bus *events.Bus) (http.Handler, string) {
	t.Helper()
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil)
	srv = withTestUsersAndCameras(t, srv, nil)
	srv.WithApplyMode("self-replace").WithUpdateChecker(checker).WithApplier(applier)
	if bus != nil {
		srv.WithEvents(bus)
	}
	token := loginAndGetToken(t, srv, "admin", "pw")
	return srv, token
}

func postApplyUpdate(t *testing.T, srv http.Handler, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/updates/apply", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)
	return w
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

func TestApplyUpdate_RechecksFresh(t *testing.T) {
	t.Run("CA2: handleApplyUpdate recheca a versão (Check fresco) antes de decidir se aplica", func(t *testing.T) {
		t.Run("recheck revela atualização que o status cacheado (stale) ainda não via", func(t *testing.T) {
			checker := &recheckChecker{
				staleSt:  release.Status{Current: "v0.15.0-rc", UpdateAvailable: false},
				freshSt:  release.Status{Current: "v0.15.0-rc", Latest: "v0.15.0-rc", UpdateAvailable: true},
				manifest: release.Manifest{Latest: "v0.15.0-rc"},
				base:     "https://example.invalid/dl/",
			}
			called := make(chan appliedCall, 1)
			srv, token := newRecheckTestServer(t, checker, fakeApplier{called: called}, nil)

			w := postApplyUpdate(t, srv, token)
			if w.Code != http.StatusAccepted {
				t.Fatalf("status = %d: %s", w.Code, w.Body.String())
			}
			if checker.checkCalls != 1 {
				t.Errorf("Check() chamado %d vezes, quero 1", checker.checkCalls)
			}
			select {
			case c := <-called:
				if c.manifest.Latest != "v0.15.0-rc" {
					t.Errorf("manifesto aplicado = %q, quero v0.15.0-rc (o do recheck fresco)", c.manifest.Latest)
				}
			case <-time.After(time.Second):
				t.Error("Apply não foi chamado")
			}
		})

		t.Run("recheck confirma que não há atualização mesmo com status stale desatualizado → 409, sem aplicar", func(t *testing.T) {
			checker := &recheckChecker{
				staleSt: release.Status{UpdateAvailable: true},
				freshSt: release.Status{UpdateAvailable: false},
			}
			called := make(chan appliedCall, 1)
			srv, token := newRecheckTestServer(t, checker, fakeApplier{called: called}, nil)

			w := postApplyUpdate(t, srv, token)
			if w.Code != http.StatusConflict {
				t.Fatalf("status = %d, quero 409: %s", w.Code, w.Body.String())
			}
			select {
			case c := <-called:
				t.Errorf("não deveria ter chamado Apply sem atualização disponível no recheck, chamado com %+v", c)
			case <-time.After(100 * time.Millisecond):
			}
		})

		t.Run("erro de rede no recheck → 409, sem tentar aplicar", func(t *testing.T) {
			checker := &recheckChecker{checkErr: errors.New("network down")}
			called := make(chan appliedCall, 1)
			srv, token := newRecheckTestServer(t, checker, fakeApplier{called: called}, nil)

			w := postApplyUpdate(t, srv, token)
			if w.Code != http.StatusConflict {
				t.Fatalf("status = %d, quero 409: %s", w.Code, w.Body.String())
			}
			select {
			case c := <-called:
				t.Errorf("não deveria ter chamado Apply com erro no recheck, chamado com %+v", c)
			case <-time.After(100 * time.Millisecond):
			}
		})
	})

	t.Run("CA3: Apply bem-sucedido ou falho publica update.applied/update.failed no eventsBus", func(t *testing.T) {
		t.Run("sucesso publica update.applied", func(t *testing.T) {
			checker := &recheckChecker{
				freshSt:  release.Status{UpdateAvailable: true},
				manifest: release.Manifest{Latest: "v0.16.0-rc"},
			}
			called := make(chan appliedCall, 1)
			bus := events.NewBus()
			ch, unsubscribe := bus.Subscribe(server.EventUpdateApplied)
			defer unsubscribe()
			srv, token := newRecheckTestServer(t, checker, fakeApplier{called: called}, bus)

			w := postApplyUpdate(t, srv, token)
			if w.Code != http.StatusAccepted {
				t.Fatalf("status = %d: %s", w.Code, w.Body.String())
			}
			select {
			case <-ch:
			case <-time.After(2 * time.Second):
				t.Fatal("esperava update.applied no eventsBus, nada chegou")
			}
		})

		t.Run("falha publica update.failed", func(t *testing.T) {
			checker := &recheckChecker{
				freshSt:  release.Status{UpdateAvailable: true},
				manifest: release.Manifest{Latest: "v0.16.0-rc"},
			}
			called := make(chan appliedCall, 1)
			bus := events.NewBus()
			ch, unsubscribe := bus.Subscribe(server.EventUpdateFailed)
			defer unsubscribe()
			srv, token := newRecheckTestServer(t, checker, fakeApplier{called: called, err: errors.New("checksum mismatch")}, bus)

			w := postApplyUpdate(t, srv, token)
			if w.Code != http.StatusAccepted {
				t.Fatalf("status = %d: %s", w.Code, w.Body.String())
			}
			select {
			case <-ch:
			case <-time.After(2 * time.Second):
				t.Fatal("esperava update.failed no eventsBus, nada chegou")
			}
		})
	})
}
