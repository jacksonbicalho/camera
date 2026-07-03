// Command seed builds a deterministic fixture for the e2e harness: a fresh
// SQLite DB (real migrations via db.Open) with an unlocked admin, one camera and
// N contiguous recordings, plus the matching .mp4 files on disk (the recordings
// list endpoint reads the filesystem, so the files must exist too). It also emits
// a camera.yaml pointing at the fixture and prints the camera/recording ids as
// JSON so scripts/e2e.sh can pass them to Playwright.
package main

import (
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"camera/internal/config"
	"camera/internal/db"
)

const (
	adminUser     = "admin"
	adminPass     = "e2e-password-123"
	camID         = "e2e00000-0000-4000-8000-000000000001"
	numRecordings = 8
)

// sample.mp4 is a tiny valid, non-fragmented clip; every seeded recording is a
// copy of it so the player has a servable src.
//
//go:embed sample.mp4
var sampleMP4 []byte

// fixtureInfo is printed to stdout for the orchestrator to consume.
type fixtureInfo struct {
	CameraID    string `json:"camera_id"`
	RecordingID int64  `json:"recording_id"`
	AdminUser   string `json:"admin_user"`
	AdminPass   string `json:"admin_pass"`
	Port        int    `json:"port"`
}

func main() {
	out := flag.String("out", "", "output fixture directory (required)")
	port := flag.Int("port", 8099, "server port written into the generated camera.yaml")
	recordings := flag.Int("recordings", numRecordings, "number of recordings to seed (scale)")
	flag.Parse()
	if *out == "" {
		fatal("missing required -out <dir>")
	}

	recDir := filepath.Join(*out, "recordings")
	hlsDir := filepath.Join(*out, "hls")
	mustMkdir(recDir)
	mustMkdir(hlsDir)

	database, err := db.Open(filepath.Join(*out, "camera.db"))
	must(err, "open db")
	defer database.Close()

	if _, err := db.CreateUser(database, adminUser, adminPass, "admin", false); err != nil {
		fatal("create admin: %v", err)
	}

	// Disable retention purging (100 years) so the cleaner never deletes the
	// fixture — the recordings use a fixed past date for determinism.
	const keepForever = "52560000"
	must(db.SetConfig(database, "storage.with_motion_minutes", keepForever), "set retention (motion)")
	must(db.SetConfig(database, "storage.without_motion_minutes", keepForever), "set retention (no motion)")

	if _, err := db.CreateCamera(database, config.CameraConfig{
		ID:               camID,
		Name:             "E2E Cam",
		RTSPURL:          "rtsp://fixture/stream",
		VideoCodec:       "h264",
		HLSVideoMode:     "auto",
		RecordVideoMode:  "copy",
		RecordingEnabled: true,
	}, nil); err != nil {
		fatal("create camera: %v", err)
	}

	// N chunks distribuídos na janela decorrida de HOJE (00:00 UTC → ~5 min atrás),
	// com segundos distintos e espaçamento ≤ 30s (⇒ fundem num único timeline run).
	// Seedear em *hoje* mantém o deep-link no dia corrente — o load inicial do
	// CameraPage e a data do by-id concordam, evitando o 2º load() (race cross-day).
	n, base, spacing := chunkLayout(*recordings, time.Now().UTC())

	tx, err := database.Begin()
	must(err, "begin tx")
	insert := `INSERT INTO recordings(camera_id, started_at, ended_at, path, size_bytes, has_motion) VALUES(?,?,?,?,?,?)`

	var firstPath string
	for i := 0; i < n; i++ {
		start := base.Add(time.Duration(i) * spacing)
		end := start.Add(spacing)
		dir := filepath.Join(recDir, camID, start.Format("2006/01/02"))
		mustMkdir(dir)
		path := filepath.Join(dir, start.Format("20060102150405")+".mp4")
		if err := os.WriteFile(path, sampleMP4, 0o644); err != nil {
			fatal("write recording file: %v", err)
		}
		// Age the file so the disk-based is_recording heuristic (mtime < 30s on the
		// latest chunk) never flags a seeded chunk as actively recording.
		if err := os.Chtimes(path, end, end); err != nil {
			fatal("set recording mtime: %v", err)
		}
		if i == 0 {
			firstPath = path
		}
		if _, err := tx.Exec(insert, camID,
			start.UTC().Format(time.RFC3339), end.UTC().Format(time.RFC3339),
			path, int64(len(sampleMP4)), boolToInt(i%7 == 0)); err != nil {
			fatal("insert recording: %v", err)
		}
	}
	must(tx.Commit(), "commit recordings")

	ids, err := db.IDsByPaths(database, []string{firstPath})
	must(err, "resolve recording id")
	firstRecID := ids[firstPath]
	if firstRecID == 0 {
		fatal("could not resolve first recording id")
	}

	writeCameraYAML(filepath.Join(*out, "camera.yaml"), *out, *port)

	info := fixtureInfo{
		CameraID:    camID,
		RecordingID: firstRecID,
		AdminUser:   adminUser,
		AdminPass:   adminPass,
		Port:        *port,
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	must(enc.Encode(info), "encode fixture info")
}

func writeCameraYAML(path, out string, port int) {
	yaml := fmt.Sprintf(`timezone: UTC
db_path: %[1]s/camera.db
log:
  output: stdout
server:
  port: %[2]d
  segments_path: %[1]s/hls
  jwt_secret: ""
storage:
  path: %[1]s/recordings
admin:
  username: %[3]s
  password: %[4]s
`, out, port, adminUser, adminPass)
	if err := os.WriteFile(path, []byte(yaml), 0o644); err != nil {
		fatal("write camera.yaml: %v", err)
	}
}

// chunkLayout distribui `requested` chunks na janela decorrida de HOJE (00:00 UTC
// até ~5 min atrás). Devolve quantos cabem (n), o início do primeiro (base) e o
// espaçamento. Invariantes: todos em hoje e no passado; segundos distintos
// (spacing ≥ 1s); spacing ≤ 30s (⇒ fundem num único timeline run). Reduz n se a
// janela decorrida do dia não comporta N segundos distintos.
func chunkLayout(requested int, now time.Time) (n int, base time.Time, spacing time.Duration) {
	now = now.UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	latest := now.Add(-5 * time.Minute).Truncate(time.Second)
	windowSecs := int(latest.Sub(startOfDay).Seconds())
	if windowSecs < 1 {
		windowSecs = 1
	}
	n = requested
	if n < 1 {
		n = 1
	}
	if n > windowSecs {
		n = windowSecs
	}
	spacingSecs := windowSecs / n
	if spacingSecs < 1 {
		spacingSecs = 1
	}
	if spacingSecs > 30 {
		spacingSecs = 30
	}
	spacing = time.Duration(spacingSecs) * time.Second
	base = latest.Add(-time.Duration(n) * spacing).Truncate(time.Second)
	if base.Before(startOfDay) {
		base = startOfDay
	}
	return n, base, spacing
}

func boolToInt(b bool) int64 {
	if b {
		return 1
	}
	return 0
}

func mustMkdir(dir string) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fatal("mkdir %s: %v", dir, err)
	}
}

func must(err error, ctx string) {
	if err != nil {
		fatal("%s: %v", ctx, err)
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "seed: "+format+"\n", args...)
	os.Exit(1)
}
