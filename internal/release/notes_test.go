package release

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNotesFetcherNotes_Success(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Write([]byte(`{"body": "### Correções\n- coisa"}`))
	}))
	defer srv.Close()

	f := NewNotesFetcher(srv.Client())
	f.baseURL = srv.URL + "/"

	body, err := f.Notes(context.Background(), "v0.15.0-rc")
	if err != nil {
		t.Fatalf("Notes: %v", err)
	}
	if body != "### Correções\n- coisa" {
		t.Errorf("body = %q", body)
	}
	if gotPath != "/v0.15.0-rc" {
		t.Errorf("path = %q, quero /v0.15.0-rc", gotPath)
	}
}

func TestNotesFetcherNotes_AddsVPrefix(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Write([]byte(`{"body": "x"}`))
	}))
	defer srv.Close()

	f := NewNotesFetcher(srv.Client())
	f.baseURL = srv.URL + "/"

	if _, err := f.Notes(context.Background(), "0.15.0-rc"); err != nil {
		t.Fatalf("Notes: %v", err)
	}
	if gotPath != "/v0.15.0-rc" {
		t.Errorf("path = %q, quero /v0.15.0-rc (prefixo v adicionado)", gotPath)
	}
}

func TestNotesFetcherNotes_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	f := NewNotesFetcher(srv.Client())
	f.baseURL = srv.URL + "/"

	if _, err := f.Notes(context.Background(), "v9.9.9-doesnotexist"); err == nil {
		t.Fatal("esperava erro pra tag inexistente")
	}
}

func TestNotesFetcherNotes_Caches(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Write([]byte(`{"body": "x"}`))
	}))
	defer srv.Close()

	f := NewNotesFetcher(srv.Client())
	f.baseURL = srv.URL + "/"

	if _, err := f.Notes(context.Background(), "v1.0.0"); err != nil {
		t.Fatalf("Notes: %v", err)
	}
	if _, err := f.Notes(context.Background(), "v1.0.0"); err != nil {
		t.Fatalf("Notes: %v", err)
	}
	if calls != 1 {
		t.Errorf("calls = %d, quero 1 (cacheado)", calls)
	}
}
