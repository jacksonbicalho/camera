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

// defaultAdminUser..defaultViewerPass são os defaults das flags -admin-user/
// -camera-id/etc. abaixo — usados quando o seed roda sem elas (fora do
// compose, à mão). e2e/docker-compose.yml repassa esses mesmos valores como
// E2E_ADMIN_USER/... tanto pro serviço `camera` (docker-entrypoint.sh, que os
// vira flags do seed) quanto pro `playwright` (fallback nos specs) — uma
// mudança só precisa ser replicada no docker-compose.yml, nunca aqui.
const (
	defaultAdminUser = "admin"
	defaultAdminPass = "e2e-password-123"
	defaultCameraID  = "e2e00000-0000-4000-8000-000000000001"
	// defaultAdminOnlyCameraID é uma 2ª câmera, nunca concedida ao viewer —
	// usada só pelo cenário negativo de acesso restrito (viewer.spec.ts).
	defaultAdminOnlyCameraID = "e2e00000-0000-4000-8000-000000000002"
	defaultViewerUser        = "viewer"
	defaultViewerPass        = "e2e-viewer-password-123"

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
	CameraID          string `json:"camera_id"`
	AdminOnlyCameraID string `json:"admin_only_camera_id"`
	RecordingID       int64  `json:"recording_id"`
	AdminUser         string `json:"admin_user"`
	AdminPass         string `json:"admin_pass"`
	ViewerUser        string `json:"viewer_user"`
	ViewerPass        string `json:"viewer_pass"`
	Port              int    `json:"port"`
}

func main() {
	out := flag.String("out", "", "diretório de saída do fixture (obrigatório)")
	port := flag.Int("port", 8099, "porta gravada no camera.yaml gerado")
	recordings := flag.Int("recordings", 5, "número de gravações a semear")
	adminUser := flag.String("admin-user", defaultAdminUser, "username do admin semeado")
	adminPass := flag.String("admin-pass", defaultAdminPass, "senha do admin semeado")
	cameraID := flag.String("camera-id", defaultCameraID, "id da câmera semeada")
	adminOnlyCameraID := flag.String("admin-only-camera-id", defaultAdminOnlyCameraID, "id da 2ª câmera, nunca concedida ao viewer")
	viewerUser := flag.String("viewer-user", defaultViewerUser, "username do viewer semeado")
	viewerPass := flag.String("viewer-pass", defaultViewerPass, "senha do viewer semeado")
	fixturePath := flag.String("fixture", "", "arquivo YAML (Fixture) descrevendo usuários/câmeras/eventos; sem ele, usa o fixture default montado a partir das flags acima")
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

	must(db.SetConfig(database, "storage.with_motion_minutes", keepForeverMinutes), "desligar retenção (motion)")
	must(db.SetConfig(database, "storage.without_motion_minutes", keepForeverMinutes), "desligar retenção (sem motion)")

	var f Fixture
	if *fixturePath != "" {
		f, err = loadFixture(*fixturePath)
		must(err, "carregar -fixture")
	} else {
		f = defaultFixture(*adminUser, *adminPass, *cameraID, *adminOnlyCameraID, *viewerUser, *viewerPass, *recordings)
	}

	info, err := applyFixture(database, storagePath, f)
	must(err, "aplicar fixture")
	info.Port = *port

	must(writeCameraYAML(filepath.Join(outDir, "camera.yaml"), *port, dbPath, storagePath, info.AdminUser, info.AdminPass), "escrever camera.yaml")

	must(json.NewEncoder(os.Stdout).Encode(info), "codificar saída JSON")
}

// seedRecordings grava os arquivos .mp4 no layout esperado pelo servidor
// ({storage}/{camera_id}/{YYYY/MM/DD}/{YYYYMMDDHHmmss}.mp4, UTC) e insere a
// linha correspondente em `recordings`. Devolve os slots gerados — usados
// por applyFixture pra calcular o instante de eventos de movimento
// referenciados por índice de gravação.
func seedRecordings(database *db.DB, storagePath string, n int, cameraID string) ([]recordingSlot, error) {
	slots := recordingSlots(n, time.Now(), recordingSpacing)
	for _, slot := range slots {
		dir := filepath.Join(storagePath, cameraID, slot.Start.Format("2006/01/02"))
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("mkdir %s: %w", dir, err)
		}

		path := filepath.Join(dir, slot.Start.Format("20060102150405")+".mp4")
		if err := os.WriteFile(path, sampleMP4, 0o644); err != nil {
			return nil, fmt.Errorf("write %s: %w", path, err)
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
			return nil, fmt.Errorf("insert recording %s: %w", path, err)
		}
	}
	return slots, nil
}

// firstRecordingID devolve o id da gravação mais antiga da câmera do
// fixture — usado como referência estável pelos specs Playwright.
func firstRecordingID(database *db.DB, cameraID string) (int64, error) {
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
func writeCameraYAML(path string, port int, dbPath, storagePath, adminUser, adminPass string) error {
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
