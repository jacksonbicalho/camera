package config

import "testing"

func sampleConfig() Config {
	c := Config{Debug: true, Timezone: "America/Sao_Paulo", DBPath: "/data/camera.db"}
	c.Log.Output = "stdout"
	c.Server.Port = 9000
	c.Server.SegmentsPath = "/data/hls"
	c.Server.JWTSecret = ""
	c.Storage.Path = "/data/recordings"
	c.Admin.Username = "admin"
	c.Admin.Password = "supersecret"
	c.SMTP.Host = "smtp.example.com"
	return c
}

func entryMap(c Config) map[string]string {
	m := map[string]string{}
	for _, kv := range c.Entries() {
		m[kv[0]] = kv[1]
	}
	return m
}

func TestEntries(t *testing.T) {
	m := entryMap(sampleConfig())
	want := map[string]string{
		"server.port":          "9000",
		"timezone":             "America/Sao_Paulo",
		"debug":                "true",
		"db_path":              "/data/camera.db",
		"storage.path":         "/data/recordings",
		"server.segments_path": "/data/hls",
		"log.output":           "stdout",
		"admin.username":       "admin",
		"smtp.host":            "smtp.example.com",
	}
	for k, v := range want {
		if m[k] != v {
			t.Errorf("Entries()[%q] = %q, want %q", k, m[k], v)
		}
	}
}

func TestEntriesHidesSecrets(t *testing.T) {
	c := sampleConfig()
	for _, kv := range c.Entries() {
		if kv[1] == "supersecret" {
			t.Fatalf("Entries() expôs a senha do admin em %q", kv[0])
		}
		if kv[0] == "admin.password" {
			t.Errorf("admin.password não deve ser uma chave exposta")
		}
	}
	// jwt vazio → modo "gerado a cada boot" (não o valor)
	m := entryMap(c)
	if got := m["server.jwt_secret"]; got == "" || got == "supersecret" {
		t.Errorf("server.jwt_secret = %q, esperava um indicador de modo", got)
	}
	// jwt setado → modo "fixo" (não o segredo)
	c.Server.JWTSecret = "topsecret"
	if got := entryMap(c)["server.jwt_secret"]; got == "topsecret" {
		t.Errorf("server.jwt_secret expôs o segredo: %q", got)
	}
}

func TestEntriesHidesSMTPPassword(t *testing.T) {
	c := sampleConfig()
	c.SMTP.Password = "smtp-secret"
	for _, kv := range c.Entries() {
		if kv[1] == "smtp-secret" {
			t.Fatalf("Entries() expôs a senha do SMTP em %q", kv[0])
		}
	}
	m := entryMap(c)
	if got := m["smtp.password"]; got == "" || got == "smtp-secret" {
		t.Errorf("smtp.password = %q, esperava um indicador de configuração", got)
	}

	c.SMTP.Password = ""
	if got := entryMap(c)["smtp.password"]; got == "smtp-secret" {
		t.Errorf("smtp.password deveria indicar vazio, got %q", got)
	}
}
