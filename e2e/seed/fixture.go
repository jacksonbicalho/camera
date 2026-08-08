package main

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"

	"camera/internal/config"
	"camera/internal/db"
)

// Fixture descreve TODO o dado semeado (usuários, câmeras — reusando
// config.CameraConfig, que já tem tags yaml pro `camera.yaml` — e eventos de
// movimento sintéticos) separado de COMO ele é materializado (applyFixture).
// O fixture default (defaultFixture, abaixo) é um literal Go; um arquivo
// YAML no mesmo formato pode substituí-lo via `-fixture <path>` sem tocar
// neste arquivo — útil pra cenários que hoje não têm flag própria (mais de
// uma câmera com configs distintas, eventos de movimento com label/bbox).
type Fixture struct {
	Users   []FixtureUser   `yaml:"users"`
	Cameras []FixtureCamera `yaml:"cameras"`
}

type FixtureUser struct {
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	Role     string `yaml:"role"` // "admin" | "viewer"
	// Cameras é a lista de ids concedidos — só relevante pra role "viewer"
	// (db.SetUserCameras); ignorado pra "admin" (acesso irrestrito).
	Cameras []string `yaml:"cameras"`
}

type FixtureCamera struct {
	config.CameraConfig `yaml:",inline"`
	// Recordings é o nº de gravações contíguas a gerar pra essa câmera (0 =
	// nenhuma, ex.: a câmera admin-only do fixture default).
	Recordings int                  `yaml:"recordings"`
	Events     []FixtureMotionEvent `yaml:"events"`
}

// FixtureMotionEvent referencia uma gravação da MESMA câmera pelo índice
// (0-based, ordem cronológica) — um evento sempre ocorre DURANTE uma
// gravação de verdade, nunca num instante solto.
type FixtureMotionEvent struct {
	RecordingIndex int     `yaml:"recording_index"`
	OffsetSeconds  int     `yaml:"offset_seconds"`
	Score          float64 `yaml:"score"`
	Label          string  `yaml:"label"`
	BboxX          float64 `yaml:"bbox_x"`
	BboxY          float64 `yaml:"bbox_y"`
	BboxW          float64 `yaml:"bbox_w"`
	BboxH          float64 `yaml:"bbox_h"`
}

// defaultFixture reproduz exatamente o fixture hardcoded de antes desta
// separação — 1 admin, 1 viewer (só com acesso à 1ª câmera), 2 câmeras (a
// 2ª sem gravações, usada só pelo cenário negativo de acesso restrito).
func defaultFixture(adminUser, adminPass, cameraID, adminOnlyCameraID, viewerUser, viewerPass string, recordings int) Fixture {
	return Fixture{
		Users: []FixtureUser{
			{Username: adminUser, Password: adminPass, Role: "admin"},
			{Username: viewerUser, Password: viewerPass, Role: "viewer", Cameras: []string{cameraID}},
		},
		Cameras: []FixtureCamera{
			{
				CameraConfig: config.CameraConfig{
					ID:               cameraID,
					Name:             "E2E Cam",
					RTSPURL:          "rtsp://fixture/stream",
					VideoCodec:       "h264",
					HLSVideoMode:     "auto",
					RecordVideoMode:  "copy",
					RecordingEnabled: true,
					LiveEnabled:      true,
				},
				Recordings: recordings,
			},
			{
				CameraConfig: config.CameraConfig{
					ID:               adminOnlyCameraID,
					Name:             "E2E Cam (admin only)",
					RTSPURL:          "rtsp://fixture/admin-only-stream",
					VideoCodec:       "h264",
					HLSVideoMode:     "auto",
					RecordVideoMode:  "copy",
					RecordingEnabled: false,
					LiveEnabled:      true,
				},
			},
		},
	}
}

// loadFixture lê e parseia um arquivo YAML no formato de Fixture.
func loadFixture(path string) (Fixture, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Fixture{}, fmt.Errorf("ler %s: %w", path, err)
	}
	var f Fixture
	if err := yaml.Unmarshal(data, &f); err != nil {
		return Fixture{}, fmt.Errorf("parsear %s: %w", path, err)
	}
	return f, nil
}

// applyFixture materializa um Fixture: cria câmeras, gravações (arquivos
// .mp4 + linhas em `recordings`) e eventos de movimento sintéticos, depois
// usuários (+ concede câmeras aos viewers — câmeras primeiro pra conceder
// acesso a algo que já existe, embora `user_settings` não tenha FK pra
// `cameras` hoje). Devolve o fixtureInfo pronto pro orquestrador (1º
// admin/viewer/câmeras encontrados, na ordem do Fixture).
func applyFixture(database *db.DB, storagePath string, f Fixture) (fixtureInfo, error) {
	var info fixtureInfo

	for i, cam := range f.Cameras {
		if _, err := db.CreateCamera(database, cam.CameraConfig, nil); err != nil {
			return info, fmt.Errorf("criar câmera %s: %w", cam.ID, err)
		}
		switch i {
		case 0:
			info.CameraID = cam.ID
		case 1:
			info.AdminOnlyCameraID = cam.ID
		}

		var slots []recordingSlot
		if cam.Recordings > 0 {
			var err error
			slots, err = seedRecordings(database, storagePath, cam.Recordings, cam.ID)
			if err != nil {
				return info, fmt.Errorf("semear gravações de %s: %w", cam.ID, err)
			}
			if i == 0 {
				id, err := firstRecordingID(database, cam.ID)
				if err != nil {
					return info, fmt.Errorf("buscar id da 1ª gravação: %w", err)
				}
				info.RecordingID = id
			}
		}

		for _, ev := range cam.Events {
			if ev.RecordingIndex < 0 || ev.RecordingIndex >= len(slots) {
				return info, fmt.Errorf("câmera %s: evento referencia recording_index %d fora do range (%d gravações)", cam.ID, ev.RecordingIndex, len(slots))
			}
			occurredAt := slots[ev.RecordingIndex].Start.Add(time.Duration(ev.OffsetSeconds) * time.Second)
			err := db.InsertMotionEvent(database, db.MotionEvent{
				CameraID:   cam.ID,
				OccurredAt: occurredAt,
				Score:      ev.Score,
				Label:      ev.Label,
				BboxX:      ev.BboxX,
				BboxY:      ev.BboxY,
				BboxW:      ev.BboxW,
				BboxH:      ev.BboxH,
			})
			if err != nil {
				return info, fmt.Errorf("câmera %s: inserir evento de movimento: %w", cam.ID, err)
			}
		}
	}

	for _, u := range f.Users {
		id, err := db.CreateUser(database, u.Username, u.Password, u.Role, false)
		if err != nil {
			return info, fmt.Errorf("criar usuário %s: %w", u.Username, err)
		}
		switch u.Role {
		case "admin":
			if info.AdminUser == "" {
				info.AdminUser, info.AdminPass = u.Username, u.Password
			}
		case "viewer":
			if info.ViewerUser == "" {
				info.ViewerUser, info.ViewerPass = u.Username, u.Password
			}
			if err := db.SetUserCameras(database, id, u.Cameras); err != nil {
				return info, fmt.Errorf("conceder câmeras a %s: %w", u.Username, err)
			}
		}
	}

	return info, nil
}
