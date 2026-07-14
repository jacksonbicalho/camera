// Command seed builds a deterministic fixture for the e2e harness: a fresh
// SQLite DB (real migrations via db.Open), an unlocked admin, one camera and
// N contiguous recordings, plus the matching .mp4 files on disk (the
// recordings list/detail endpoints and the static /recordings/ mount both
// read the filesystem, so the files must exist too). It also emits a
// camera.yaml pointing at the fixture and prints the generated ids as JSON
// so an orchestrator (scripts/e2e.sh) can pass them to Playwright.
package main

import (
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"

	"camera/internal/config"
	"camera/internal/db"
)

const (
	adminUser = "admin"
	adminPass = "e2e-password-123"
	cameraID  = "e2e00000-0000-4000-8000-000000000001"

	// viewerUser tem acesso concedido só à câmera do fixture — usado pelo
	// cenário e2e que cobre o papel viewer (acesso restrito), em vez de só
	// admin.
	viewerUser = "viewer"
	viewerPass = "e2e-viewer-password-123"

	// keepForeverMinutes desliga a purga de retenção (100 anos) para o
	// Cleaner nunca apagar o fixture durante a vida do container.
	keepForeverMinutes = "52560000"

	recordingSpacing = 2 * time.Minute
)

// sample.mp4 é um clip H.264 minúsculo, válido e não-fragmentado (moov
// presente) — cada gravação semeada é uma cópia dele, só para o player ter
// um src servível.
//
//go:embed sample.mp4
var sampleMP4 []byte

// fixtureInfo é impresso em stdout para o orquestrador consumir.
type fixtureInfo struct {
	CameraID    string `json:"camera_id"`
	RecordingID int64  `json:"recording_id"`
	AdminUser   string `json:"admin_user"`
	AdminPass   string `json:"admin_pass"`
	ViewerUser  string `json:"viewer_user"`
	ViewerPass  string `json:"viewer_pass"`
	Port        int    `json:"port"`
}

func main() {
	out := flag.String("out", "", "diretório de saída do fixture (obrigatório)")
	port := flag.Int("port", 8099, "porta gravada no camera.yaml gerado")
	recordings := flag.Int("recordings", 5, "número de gravações a semear")
	flag.Parse()

	if *out == "" {
		fatal("faltou -out <dir>")
	}
	outDir, err := filepath.Abs(*out)
	must(err, "resolver -out")

	// storage.path == server.recordings_path (deixado vazio no YAML, herda
	// storage.path) — precisam ser o MESMO caminho absoluto pra
	// filepath.Rel funcionar na construção da URL /recordings/... e pro
	// static file server encontrar os arquivos.
	storagePath := filepath.Join(outDir, "recordings")
	must(os.MkdirAll(storagePath, 0o755), "mkdir storage")

	dbPath := filepath.Join(outDir, "camera.db")
	must(os.MkdirAll(filepath.Dir(dbPath), 0o755), "mkdir db dir")

	database, err := db.Open(dbPath)
	must(err, "abrir db")
	defer database.Close()

	_, err = db.CreateUser(database, adminUser, adminPass, "admin", false)
	must(err, "criar admin")

	viewerID, err := db.CreateUser(database, viewerUser, viewerPass, "viewer", false)
	must(err, "criar viewer")

	must(db.SetConfig(database, "storage.with_motion_minutes", keepForeverMinutes), "desligar retenção (motion)")
	must(db.SetConfig(database, "storage.without_motion_minutes", keepForeverMinutes), "desligar retenção (sem motion)")

	_, err = db.CreateCamera(database, config.CameraConfig{
		ID:               cameraID,
		Name:             "E2E Cam",
		RTSPURL:          "rtsp://fixture/stream",
		VideoCodec:       "h264",
		HLSVideoMode:     "auto",
		RecordVideoMode:  "copy",
		RecordingEnabled: true,
	}, nil)
	must(err, "criar câmera")
	must(db.SetUserCameras(database, viewerID, []string{cameraID}), "conceder câmera ao viewer")

	must(seedRecordings(database, storagePath, *recordings), "semear gravações")

	must(writeCameraYAML(filepath.Join(outDir, "camera.yaml"), *port, dbPath, storagePath), "escrever camera.yaml")

	recordingID, err := firstRecordingID(database)
	must(err, "buscar id da 1ª gravação")

	info := fixtureInfo{
		CameraID:    cameraID,
		RecordingID: recordingID,
		AdminUser:   adminUser,
		AdminPass:   adminPass,
		ViewerUser:  viewerUser,
		ViewerPass:  viewerPass,
		Port:        *port,
	}
	must(json.NewEncoder(os.Stdout).Encode(info), "codificar saída JSON")
}

// seedRecordings grava os arquivos .mp4 no layout esperado pelo servidor
// ({storage}/{camera_id}/{YYYY/MM/DD}/{YYYYMMDDHHmmss}.mp4, UTC) e insere a
// linha correspondente em `recordings`.
func seedRecordings(database *db.DB, storagePath string, n int) error {
	slots := recordingSlots(n, time.Now(), recordingSpacing)
	for _, slot := range slots {
		dir := filepath.Join(storagePath, cameraID, slot.Start.Format("2006/01/02"))
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", dir, err)
		}

		path := filepath.Join(dir, slot.Start.Format("20060102150405")+".mp4")
		if err := os.WriteFile(path, sampleMP4, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", path, err)
		}

		err := db.InsertRecording(database, db.Recording{
			CameraID:  cameraID,
			StartedAt: slot.Start,
			EndedAt:   slot.End,
			Path:      path,
			SizeBytes: int64(len(sampleMP4)),
			HasMotion: false,
		})
		if err != nil {
			return fmt.Errorf("insert recording %s: %w", path, err)
		}
	}
	return nil
}

// firstRecordingID devolve o id da gravação mais antiga da câmera do
// fixture — usado como referência estável pelos specs Playwright.
func firstRecordingID(database *db.DB) (int64, error) {
	var id int64
	err := database.QueryRow(
		`SELECT id FROM recordings WHERE camera_id = ? ORDER BY started_at ASC LIMIT 1`,
		cameraID,
	).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

// writeCameraYAML escreve o bootstrap do fixture. Os caminhos são absolutos
// porque cmd/camera resolve DBPath/Storage.Path relativos ao CWD do
// processo, não ao diretório do próprio camera.yaml — o servidor real pode
// rodar de um CWD diferente (ex.: dentro do container e2e).
func writeCameraYAML(path string, port int, dbPath, storagePath string) error {
	cfg := config.Config{
		DBPath:   dbPath,
		Timezone: "UTC",
		Server: config.ServerConfig{
			Port: port,
		},
		Storage: config.StorageConfig{
			Path: storagePath,
		},
		Admin: config.AdminConfig{
			Username: adminUser,
			Password: adminPass,
		},
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal camera.yaml: %w", err)
	}
	return os.WriteFile(path, data, 0o644)
}

func must(err error, what string) {
	if err != nil {
		fatal("%s: %v", what, err)
	}
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "seed: "+format+"\n", args...)
	os.Exit(1)
}
