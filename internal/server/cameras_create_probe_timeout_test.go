package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/ffprobe"
	"camera/internal/server"
)

// capturingExecutor returns a canned successful ffprobe result but records the
// deadline of the context it was called with, so the test can assert on how
// long handleCreateCamera is willing to wait for the implicit probe without
// actually having to block that long.
type capturingExecutor struct {
	deadline    time.Time
	hasDeadline bool
}

func (f *capturingExecutor) Execute(ctx context.Context, _ string, _ ...string) ([]byte, error) {
	f.deadline, f.hasDeadline = ctx.Deadline()
	return []byte(`{"streams":[{"codec_type":"video","codec_name":"h264","width":640,"height":480}]}`), nil
}

// A plain "Salvar" (no explicit "Detectar" click) leaves video_codec/has_audio/
// width/height all unset, which triggers an implicit probe of the RTSP URL
// before the camera is inserted (see handleCreateCamera). Unlike the explicit
// "Detectar" button (POST /api/settings/cameras/detect-streams, still allowed
// the full 15s), this implicit probe must not turn a plain create into a
// multi-second hang when the camera is unreachable — it should give up much
// sooner and fall back to sane defaults (already covered by ffprobe.Resolve).
func TestCreateCamera_ImplicitProbeUsesShorterTimeoutThanExplicitDetect(t *testing.T) {
	database := openServerTestDB(t)
	if _, err := db.CreateUser(database, "admin_user", "adminpw", "admin", false); err != nil {
		t.Fatalf("criar admin: %v", err)
	}
	exec := &capturingExecutor{}
	srv := server.NewServer(config.ServerConfig{}, "UTC", nil, discardLogger(), nil).
		WithDB(database).
		WithProber(ffprobe.NewProber(exec))
	token := loginAndGetToken(t, srv, "admin_user", "adminpw")

	body := `{"name":"cam-auto","rtsp_url":"rtsp://unreachable"}`
	req := httptest.NewRequest(http.MethodPost, "/api/settings/cameras", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["video_codec"] != "h264" {
		t.Errorf("expected the probed codec to still be persisted, got %v", resp["video_codec"])
	}

	if !exec.hasDeadline {
		t.Fatal("expected the probe's context to carry a deadline")
	}
	if remaining := time.Until(exec.deadline); remaining > 5*time.Second {
		t.Errorf("implicit probe on create got a %v budget, want <= 5s (well under the explicit "+
			"'Detectar' button's 15s) so an unreachable camera can't hang a plain 'Salvar' click", remaining)
	}
}
