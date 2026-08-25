package release

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// stubRelease descreve uma release na resposta fake da API de releases —
// só o suficiente pra montar o JSON que fetchReleaseList espera.
type stubRelease struct {
	tag        string
	prerelease bool
	createdAt  string // RFC3339
	manifest   string // conteúdo cru do version.json dessa release
}

// releasesStub sobe um httptest.Server servindo /releases (lista, no
// formato da API do GitHub) e um asset version.json por release (URL
// referenciada em browser_download_url, resolvida contra o próprio host do
// servidor — só existe depois que o servidor sobe, por isso o mux é
// montado com um ponteiro pra srv capturado por closure).
func releasesStub(t *testing.T, releases []stubRelease) *httptest.Server {
	t.Helper()
	var srv *httptest.Server
	mux := http.NewServeMux()

	mux.HandleFunc("/releases", func(w http.ResponseWriter, r *http.Request) {
		body := "["
		for i, rel := range releases {
			if i > 0 {
				body += ","
			}
			body += fmt.Sprintf(
				`{"tag_name":%q,"prerelease":%v,"created_at":%q,"assets":[{"name":"version.json","browser_download_url":%q}]}`,
				rel.tag, rel.prerelease, rel.createdAt, srv.URL+"/assets/"+rel.tag+"/version.json",
			)
		}
		body += "]"
		w.Write([]byte(body))
	})
	for _, rel := range releases {
		rel := rel
		mux.HandleFunc("/assets/"+rel.tag+"/version.json", func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte(rel.manifest))
		})
	}

	srv = httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

const sampleManifestStable = `{
  "latest": "v1.4.0-dev",
  "notes_md": "### Novidades\n- algo",
  "image": "jacksonbicalho/os-camera:1.4.0-dev",
  "assets": {
    "linux-amd64": { "name": "camera-linux-amd64", "sha256": "abc" }
  }
}`

func TestCheckerCheckSuccess(t *testing.T) {
	srv := releasesStub(t, []stubRelease{
		{tag: "v1.4.0-dev", createdAt: "2026-01-01T00:00:00Z", manifest: sampleManifestStable},
	})

	c := NewChecker(srv.URL+"/releases", "v1.3.0-dev", srv.Client())
	m, err := c.Check(context.Background())
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if m.Latest != "v1.4.0-dev" {
		t.Errorf("Latest = %q, quero v1.4.0-dev", m.Latest)
	}

	st := c.Status()
	if st.Latest != "v1.4.0-dev" || st.Image != "jacksonbicalho/os-camera:1.4.0-dev" {
		t.Errorf("Status = %+v", st)
	}
	if st.Current != "v1.3.0-dev" {
		t.Errorf("Current = %q, quero v1.3.0-dev", st.Current)
	}
	if !st.UpdateAvailable {
		t.Error("UpdateAvailable deveria ser true (v1.4 > v1.3)")
	}
	if st.CheckedAt.IsZero() {
		t.Error("CheckedAt não deveria ser zero após Check")
	}
	if st.Err != "" {
		t.Errorf("Err = %q, quero vazio", st.Err)
	}
	if got, want := c.DownloadBase(), srv.URL+"/assets/v1.4.0-dev/"; got != want {
		t.Errorf("DownloadBase() = %q, quero %q", got, want)
	}
}

// CA2: o checker detecta atualização disponível a partir de qualquer release
// publicada (estável ou pré-release) mais nova por semver, ou por tempo de
// build quando a versão é a mesma de uma tag flutuante recortada de novo.
func TestCheckerConsidersAnyNewerRelease(t *testing.T) {
	t.Run("CA2: pré-release mais recente que a estável vira o latest resolvido, mesmo com versão semver maior que a instalada", func(t *testing.T) {
		// v0.14.1-dev (estável, criada antes) e v0.15.0-rc (pré-release,
		// criada depois) — reproduz o caso real: a instalação está na
		// v0.14.1-dev e existe uma v0.15.0-rc mais nova, mas /releases/latest
		// (que este teste não usa mais) nunca a veria.
		srv := releasesStub(t, []stubRelease{
			{
				tag: "v0.14.1-dev", prerelease: false, createdAt: "2026-06-25T07:45:58Z",
				manifest: `{"latest":"v0.14.1-dev","assets":{}}`,
			},
			{
				tag: "v0.15.0-rc", prerelease: true, createdAt: "2026-07-09T22:05:19Z",
				manifest: `{"latest":"v0.15.0-rc","assets":{}}`,
			},
		})

		c := NewChecker(srv.URL+"/releases", "v0.14.1-dev", srv.Client())
		if _, err := c.Check(context.Background()); err != nil {
			t.Fatalf("Check: %v", err)
		}

		st := c.Status()
		if st.Latest != "v0.15.0-rc" {
			t.Errorf("Latest = %q, quero v0.15.0-rc (a mais recente publicada, pré-release inclusa)", st.Latest)
		}
		if !st.UpdateAvailable {
			t.Error("UpdateAvailable deveria ser true — v0.15.0-rc é mais nova que v0.14.1-dev")
		}
	})

	t.Run("CA2: mesma versão (tag flutuante de RC recortada de novo) mas republicada depois do build atual: UpdateAvailable=true", func(t *testing.T) {
		srv := releasesStub(t, []stubRelease{
			{
				tag: "v0.15.0-rc", prerelease: true, createdAt: "2026-08-25T00:05:54Z",
				manifest: `{"latest":"v0.15.0-rc","assets":{}}`,
			},
		})

		c := NewChecker(srv.URL+"/releases", "v0.15.0-rc", srv.Client())
		c.CurrentBuiltAt = "2026-07-09T22:10:00Z" // build antigo, ANTES da republicação
		if _, err := c.Check(context.Background()); err != nil {
			t.Fatalf("Check: %v", err)
		}

		st := c.Status()
		if st.Latest != "v0.15.0-rc" {
			t.Errorf("Latest = %q, quero v0.15.0-rc", st.Latest)
		}
		if !st.UpdateAvailable {
			t.Error("UpdateAvailable deveria ser true — mesma versão, mas republicada depois do build instalado")
		}
	})

	t.Run("CA2: mesma versão, já é a build corrente (nenhuma republicação depois do build atual): UpdateAvailable=false", func(t *testing.T) {
		srv := releasesStub(t, []stubRelease{
			{
				tag: "v0.15.0-rc", prerelease: true, createdAt: "2026-07-09T22:05:19Z",
				manifest: `{"latest":"v0.15.0-rc","assets":{}}`,
			},
		})

		c := NewChecker(srv.URL+"/releases", "v0.15.0-rc", srv.Client())
		c.CurrentBuiltAt = "2026-07-09T22:10:00Z" // build DEPOIS da criação da release — já é essa build
		if _, err := c.Check(context.Background()); err != nil {
			t.Fatalf("Check: %v", err)
		}

		if c.Status().UpdateAvailable {
			t.Error("UpdateAvailable deveria ser false — o build atual já é posterior à release resolvida")
		}
	})

	t.Run("CA2: draft é ignorada na escolha da release mais recente", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/releases" {
				w.Write([]byte(`[
					{"tag_name":"v9.9.9-draft","prerelease":false,"draft":true,"created_at":"2026-09-01T00:00:00Z","assets":[{"name":"version.json","browser_download_url":"` + "http://" + r.Host + `/assets/draft/version.json"}]},
					{"tag_name":"v1.0.0","prerelease":false,"draft":false,"created_at":"2026-01-01T00:00:00Z","assets":[{"name":"version.json","browser_download_url":"` + "http://" + r.Host + `/assets/stable/version.json"}]}
				]`))
				return
			}
			w.Write([]byte(`{"latest":"v1.0.0","assets":{}}`))
		}))
		t.Cleanup(srv.Close)

		c := NewChecker(srv.URL+"/releases", "v0.9.0", srv.Client())
		if _, err := c.Check(context.Background()); err != nil {
			t.Fatalf("Check: %v", err)
		}
		if c.Status().Latest != "v1.0.0" {
			t.Errorf("Latest = %q, draft não deveria ser elegível", c.Status().Latest)
		}
	})
}

func TestCheckerCheckErrors(t *testing.T) {
	t.Run("404 na lista de releases", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "nope", http.StatusNotFound)
		}))
		t.Cleanup(srv.Close)
		c := NewChecker(srv.URL, "v1.3.0-dev", srv.Client())
		if _, err := c.Check(context.Background()); err == nil {
			t.Error("esperava erro em 404")
		}
		if c.Status().Err == "" {
			t.Error("Err deveria ficar no cache após falha")
		}
	})

	t.Run("json inválido na lista de releases", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("{not json"))
		}))
		t.Cleanup(srv.Close)
		c := NewChecker(srv.URL, "v1.3.0-dev", srv.Client())
		if _, err := c.Check(context.Background()); err == nil {
			t.Error("esperava erro em JSON inválido")
		}
	})

	t.Run("nenhuma release publicada", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("[]"))
		}))
		t.Cleanup(srv.Close)
		c := NewChecker(srv.URL, "v1.3.0-dev", srv.Client())
		if _, err := c.Check(context.Background()); err == nil {
			t.Error("esperava erro sem nenhuma release")
		}
	})
}

func TestUpdateAvailable(t *testing.T) {
	cases := []struct {
		name            string
		current, latest string
		builtAt         string
		latestCreatedAt time.Time
		want            bool
	}{
		{"latest maior", "v1.3.0-dev", "v1.4.0-dev", "", time.Time{}, true},
		{"igual, sem info de build", "v1.4.0-dev", "v1.4.0-dev", "", time.Time{}, false},
		{"latest menor", "v1.4.0-dev", "v1.3.0-dev", "", time.Time{}, false},
		{"current inválido", "dev", "v1.4.0-dev", "", time.Time{}, false},
		{"latest inválido", "v1.3.0-dev", "", "", time.Time{}, false},
		{"ambos inválidos", "dev", "snapshot", "", time.Time{}, false},
		{"patch maior", "v1.4.0-dev", "v1.4.1-dev", "", time.Time{}, true},
		{
			"igual, release republicada depois do build atual", "v0.15.0-rc", "v0.15.0-rc",
			"2026-07-09T22:10:00Z", mustParseRFC3339(t, "2026-08-25T00:05:54Z"), true,
		},
		{
			"igual, build atual já é posterior à release", "v0.15.0-rc", "v0.15.0-rc",
			"2026-08-25T00:10:00Z", mustParseRFC3339(t, "2026-08-25T00:05:54Z"), false,
		},
		{
			"igual, builtAt não parseável: desempate desativado", "v0.15.0-rc", "v0.15.0-rc",
			"não é uma data", mustParseRFC3339(t, "2026-08-25T00:05:54Z"), false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := updateAvailable(tc.current, tc.latest, tc.builtAt, tc.latestCreatedAt); got != tc.want {
				t.Errorf("updateAvailable(%q, %q, %q, %v) = %v, quero %v",
					tc.current, tc.latest, tc.builtAt, tc.latestCreatedAt, got, tc.want)
			}
		})
	}
}

func mustParseRFC3339(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("parse %q: %v", s, err)
	}
	return tm
}

func TestStatusWithoutCheck(t *testing.T) {
	c := NewChecker("http://example.invalid", "v1.3.0-dev", nil)
	st := c.Status()
	if st.Current != "v1.3.0-dev" {
		t.Errorf("Current = %q", st.Current)
	}
	if st.Latest != "" || st.UpdateAvailable {
		t.Errorf("antes do 1º check: Latest deveria estar vazio e UpdateAvailable false: %+v", st)
	}
	if c.DownloadBase() != "" {
		t.Errorf("DownloadBase() antes do 1º check deveria ser vazio, got %q", c.DownloadBase())
	}
}
