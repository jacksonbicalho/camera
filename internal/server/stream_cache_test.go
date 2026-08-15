package server_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/server"
)

// setupStreamCacheServer wires a server whose SegmentsPath holds a playlist and
// a segment for an accessible camera, returning an admin token and the camera id.
func setupStreamCacheServer(t *testing.T) (*server.Server, string, string) {
	t.Helper()
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
		t.Fatalf("create user: %v", err)
	}
	cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://admin:pw@192.168.1.29:554/"}
	if _, err := db.CreateCamera(database, cam, nil); err != nil {
		t.Fatalf("create camera: %v", err)
	}

	segDir := filepath.Join(t.TempDir(), cam.ID)
	if err := os.MkdirAll(segDir, 0o755); err != nil {
		t.Fatalf("mkdir segments: %v", err)
	}
	if err := os.WriteFile(filepath.Join(segDir, "index.m3u8"), []byte("#EXTM3U\n"), 0o644); err != nil {
		t.Fatalf("write playlist: %v", err)
	}
	if err := os.WriteFile(filepath.Join(segDir, "000000.ts"), []byte("ts-bytes"), 0o644); err != nil {
		t.Fatalf("write segment: %v", err)
	}

	cfg := config.ServerConfig{SegmentsPath: filepath.Dir(segDir)}
	srv := server.NewServer(cfg, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "admin", "pw")
	return srv, token, cam.ID
}

func TestStreamPlaylistIsNotCacheable(t *testing.T) {
	srv, token, id := setupStreamCacheServer(t)

	req := httptest.NewRequest(http.MethodGet, "/stream/"+id+"/index.m3u8", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	cc := w.Header().Get("Cache-Control")
	if !strings.Contains(cc, "no-cache") {
		t.Fatalf("playlist must not be cacheable; Cache-Control=%q", cc)
	}
}

func TestStreamSegmentStaysCacheable(t *testing.T) {
	srv, token, id := setupStreamCacheServer(t)

	req := httptest.NewRequest(http.MethodGet, "/stream/"+id+"/000000.ts", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if cc := w.Header().Get("Cache-Control"); strings.Contains(cc, "no-cache") {
		t.Fatalf("segments should remain cacheable; got Cache-Control=%q", cc)
	}
}

// setupRecordingsCacheServer wires a server whose RecordingsPath holds a real
// recording chunk for an accessible camera, returning an admin token and the
// URL path (relative to /recordings/) of that chunk.
func setupRecordingsCacheServer(t *testing.T) (*server.Server, string, string) {
	t.Helper()
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin", "pw", "admin", false); err != nil {
		t.Fatalf("create user: %v", err)
	}
	cam := config.CameraConfig{ID: "cam1", Name: "Cam", RTSPURL: "rtsp://admin:pw@192.168.1.29:554/"}
	if _, err := db.CreateCamera(database, cam, nil); err != nil {
		t.Fatalf("create camera: %v", err)
	}

	recordingsRoot := t.TempDir()
	recDir := filepath.Join(recordingsRoot, cam.ID, "2026", "01", "01")
	if err := os.MkdirAll(recDir, 0o755); err != nil {
		t.Fatalf("mkdir recordings: %v", err)
	}
	if err := os.WriteFile(filepath.Join(recDir, "20260101120000.mp4"), []byte("mp4-bytes"), 0o644); err != nil {
		t.Fatalf("write recording: %v", err)
	}

	cfg := config.ServerConfig{RecordingsPath: recordingsRoot}
	srv := server.NewServer(cfg, "UTC", []config.CameraConfig{cam}, discardLogger(), nil).WithDB(database)
	token := loginAndGetToken(t, srv, "admin", "pw")
	return srv, token, "/recordings/" + cam.ID + "/2026/01/01/20260101120000.mp4"
}

func TestRecordingsNoStoreCacheControl(t *testing.T) {
	t.Run("CA2: GET autenticado a uma gravação real retorna Cache-Control: no-store", func(t *testing.T) {
		srv, token, path := setupRecordingsCacheServer(t)

		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		w := httptest.NewRecorder()
		srv.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		if cc := w.Header().Get("Cache-Control"); cc != "no-store" {
			t.Fatalf("recording must be no-store (proxy/CDN cache pode servir um snapshot truncado, ver work_progress/analysis/202608142354_recordings-no-store-cache-control.md); got Cache-Control=%q", cc)
		}
	})
}
