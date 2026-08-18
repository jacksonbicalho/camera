package db_test

import (
	"testing"
	"time"

	"camera/internal/db"
)

func TestAggregateMotionEvents(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")
	ensureCamera(t, database, "cam2")

	base := time.Date(2026, 6, 20, 10, 0, 0, 0, time.UTC)
	mk := func(cam string, at time.Time, label string) {
		if err := db.InsertMotionEvent(database, db.MotionEvent{CameraID: cam, OccurredAt: at, Score: 0.5, Label: label}); err != nil {
			t.Fatalf("insert: %v", err)
		}
	}
	mk("cam1", base, "pessoa")
	mk("cam1", base.Add(time.Hour), "")          // mesmo dia
	mk("cam2", base.Add(24*time.Hour), "carro")  // outra câmera → fora do escopo
	mk("cam1", base.Add(72*time.Hour), "pessoa") // fora do range (depois do `to`)

	from := time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 6, 22, 0, 0, 0, 0, time.UTC) // exclusivo: pega 20 e 21

	rep, err := db.AggregateMotionEvents(database, from, to, "cam1")
	if err != nil {
		t.Fatalf("aggregate: %v", err)
	}
	// 2 motion (cam1, dia 20); cam2 fora do escopo
	if rep.Total != 2 {
		t.Fatalf("total = %d, want 2", rep.Total)
	}
	if len(rep.ByDay) != 2 || rep.ByDay[0].Day != "2026-06-20" || rep.ByDay[0].Count != 2 || rep.ByDay[1].Day != "2026-06-21" || rep.ByDay[1].Count != 0 {
		t.Errorf("by_day = %+v", rep.ByDay)
	}
	// dia 20: 1 pessoa + 1 movimento (label vazio)
	if rep.ByDay[0].ByCategory["pessoa"] != 1 || rep.ByDay[0].ByCategory["movimento"] != 1 {
		t.Errorf("by_day[0].by_category = %+v", rep.ByDay[0].ByCategory)
	}
	if rep.ByLabel["pessoa"] != 1 || rep.ByLabel[""] != 1 {
		t.Errorf("by_label = %+v", rep.ByLabel)
	}
	if _, ok := rep.ByLabel["carro"]; ok {
		t.Errorf("by_label não deveria conter label de cam2: %+v", rep.ByLabel)
	}
}

func TestAggregateMotionEventsHourly(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")
	loc := time.FixedZone("BRT", -3*3600) // UTC-3

	mk := func(at time.Time, label string) {
		if err := db.InsertMotionEvent(database, db.MotionEvent{CameraID: "cam1", OccurredAt: at, Score: 0.5, Label: label}); err != nil {
			t.Fatal(err)
		}
	}
	// dia (em BRT) = 2026-06-21 → [03:00Z, +24h)
	mk(time.Date(2026, 6, 21, 12, 0, 0, 0, time.UTC), "")        // 09:00 BRT → hora 9, movimento
	mk(time.Date(2026, 6, 21, 12, 30, 0, 0, time.UTC), "pessoa") // 09:30 BRT → hora 9, pessoa

	from := time.Date(2026, 6, 21, 3, 0, 0, 0, time.UTC) // 00:00 BRT
	to := time.Date(2026, 6, 22, 3, 0, 0, 0, time.UTC)   // 24:00 BRT

	rep, err := db.AggregateMotionEventsHourly(database, from, to, "cam1", loc)
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.ByHour) != 24 {
		t.Fatalf("esperava 24 buckets de hora, got %d", len(rep.ByHour))
	}
	if rep.Total != 2 {
		t.Fatalf("total = %d, want 2", rep.Total)
	}
	if rep.ByHour[9].Hour != 9 || rep.ByHour[9].Count != 2 || rep.ByHour[9].ByCategory["movimento"] != 1 || rep.ByHour[9].ByCategory["pessoa"] != 1 {
		t.Errorf("hora 9 = %+v", rep.ByHour[9])
	}
	if rep.ByHour[0].Count != 0 {
		t.Errorf("hora 0 deveria ser zero: %+v", rep.ByHour[0])
	}
	if rep.ByLabel[""] != 1 || rep.ByLabel["pessoa"] != 1 {
		t.Errorf("by_label = %+v", rep.ByLabel)
	}
}

func TestAggregateMotionEventsFillsEmptyDays(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")
	// evento só no dia 21
	if err := db.InsertMotionEvent(database, db.MotionEvent{
		CameraID: "cam1", OccurredAt: time.Date(2026, 6, 21, 10, 0, 0, 0, time.UTC), Score: 0.5, Label: "pessoa",
	}); err != nil {
		t.Fatal(err)
	}

	from := time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 6, 23, 0, 0, 0, 0, time.UTC) // janela contínua: 20, 21, 22

	rep, err := db.AggregateMotionEvents(database, from, to, "cam1")
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.ByDay) != 3 {
		t.Fatalf("esperava 3 dias contínuos (20,21,22), got %d: %+v", len(rep.ByDay), rep.ByDay)
	}
	if rep.ByDay[0].Day != "2026-06-20" || rep.ByDay[0].Count != 0 {
		t.Errorf("dia 20 deveria ser zero: %+v", rep.ByDay[0])
	}
	if rep.ByDay[1].Day != "2026-06-21" || rep.ByDay[1].Count != 1 {
		t.Errorf("dia 21 deveria ter 1: %+v", rep.ByDay[1])
	}
	if rep.ByDay[2].Day != "2026-06-22" || rep.ByDay[2].Count != 0 {
		t.Errorf("dia 22 deveria ser zero: %+v", rep.ByDay[2])
	}
}

func TestAggregateMotionEventsDayHour(t *testing.T) {
	database := openTestDB(t)
	ensureCamera(t, database, "cam1")
	ensureCamera(t, database, "cam2")
	loc := time.FixedZone("BRT", -3*3600) // UTC-3

	mk := func(cam string, at time.Time, label string) {
		if err := db.InsertMotionEvent(database, db.MotionEvent{CameraID: cam, OccurredAt: at, Score: 0.5, Label: label}); err != nil {
			t.Fatal(err)
		}
	}
	mk("cam1", time.Date(2026, 6, 21, 12, 0, 0, 0, time.UTC), "pessoa") // 09:00 BRT 06-21 → (06-21, 9)
	mk("cam1", time.Date(2026, 6, 21, 12, 30, 0, 0, time.UTC), "")      // 09:30 BRT 06-21 → (06-21, 9)
	mk("cam2", time.Date(2026, 6, 21, 12, 0, 0, 0, time.UTC), "carro")  // outra câmera → ignorado

	from := time.Date(2026, 6, 21, 3, 0, 0, 0, time.UTC) // 00:00 BRT 06-21
	to := time.Date(2026, 6, 24, 3, 0, 0, 0, time.UTC)   // +3 dias (21, 22, 23)

	rep, err := db.AggregateMotionEventsDayHour(database, from, to, "cam1", loc)
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.Heatmap) != 72 { // 3 dias × 24
		t.Fatalf("esperava 72 células (3×24), got %d", len(rep.Heatmap))
	}
	if rep.Total != 2 {
		t.Fatalf("total = %d, want 2", rep.Total)
	}
	cell := func(date string, hour int) db.DayHourCell {
		for _, c := range rep.Heatmap {
			if c.Date == date && c.Hour == hour {
				return c
			}
		}
		t.Fatalf("célula (%s,%d) ausente", date, hour)
		return db.DayHourCell{}
	}
	if c := cell("2026-06-21", 9); c.Count != 2 {
		t.Errorf("célula 06-21/9h = %+v, want count 2", c)
	}
	if c := cell("2026-06-23", 3); c.Count != 0 {
		t.Errorf("célula sem evento deveria ser zero: %+v", c)
	}
	// ordenado por data, depois hora → primeiro bloco = 06-21
	if rep.Heatmap[0].Date != "2026-06-21" || rep.Heatmap[0].Hour != 0 {
		t.Errorf("primeira célula = %+v, want (06-21, 0)", rep.Heatmap[0])
	}
	if rep.Heatmap[9].Date != "2026-06-21" || rep.Heatmap[9].Hour != 9 || rep.Heatmap[9].Count != 2 {
		t.Errorf("índice 9 = %+v, want 06-21/9h count 2", rep.Heatmap[9])
	}
}

// TestMotionCategory_FielAoLabelReal — CA2 (metade backend): a categoria de
// um motion event com label não-pessoa é fiel ao label real (trim +
// lowercase), não mais um bucket genérico "ia".
func TestMotionCategory_FielAoLabelReal(t *testing.T) {
	cases := []struct {
		label string
		want  string
	}{
		{"", "movimento"},
		{"pessoa", "pessoa"},
		{"Person detected", "pessoa"},
		{"carro", "carro"},
		{"  Dog  ", "dog"},
		{"Cachorro", "cachorro"},
	}
	for _, c := range cases {
		if got := db.MotionCategory(c.label); got != c.want {
			t.Errorf("MotionCategory(%q) = %q, want %q", c.label, got, c.want)
		}
	}
}

// TestAggregateMotionEventsExcludesStateTransitions cobre a história
// chore/remover-classificacao-estados-backend — AggregateMotionEvents/Hourly param de
// somar transições de camera_state_history no relatório. Usa SQL bruto (sem
// db.CreateStateClassifier/stateclass, ambos removidos num ticket anterior desta mesma
// história) — só a tabela camera_state_history/camera_state_classifiers ainda existe
// nesta fase, removida pela migration do último ticket.
func TestAggregateMotionEventsExcludesStateTransitions(t *testing.T) {
	t.Run("CA7: AggregateMotionEvents/Hourly não somam mais transições de camera_state_history (classificação de estado removida)", func(t *testing.T) {
		database := openTestDB(t)
		ensureCamera(t, database, "cam1")

		base := time.Date(2026, 6, 20, 10, 0, 0, 0, time.UTC)
		if err := db.InsertMotionEvent(database, db.MotionEvent{CameraID: "cam1", OccurredAt: base, Score: 0.5, Label: "pessoa"}); err != nil {
			t.Fatalf("insert motion: %v", err)
		}

		res, err := database.Exec(
			`INSERT INTO camera_state_classifiers (camera_id, name, crop_x, crop_y, crop_w, crop_h) VALUES (?, ?, ?, ?, ?, ?)`,
			"cam1", "Portão", 0.1, 0.1, 0.3, 0.3,
		)
		if err != nil {
			t.Fatalf("insert classifier: %v", err)
		}
		cid, _ := res.LastInsertId()
		if _, err := database.Exec(
			`INSERT INTO camera_state_history (classifier_id, state, confidence, changed_at) VALUES (?, ?, ?, ?)`,
			cid, "aberto", 0.9, "2026-06-20 12:00:00",
		); err != nil {
			t.Fatalf("insert transition: %v", err)
		}

		from := time.Date(2026, 6, 20, 0, 0, 0, 0, time.UTC)
		to := time.Date(2026, 6, 21, 0, 0, 0, 0, time.UTC)

		rep, err := db.AggregateMotionEvents(database, from, to, "cam1")
		if err != nil {
			t.Fatalf("aggregate: %v", err)
		}
		if rep.Total != 1 {
			t.Errorf("total = %d, want 1 (só o evento de movimento, sem a transição de estado)", rep.Total)
		}

		hourly, err := db.AggregateMotionEventsHourly(database, from, to, "cam1", time.UTC)
		if err != nil {
			t.Fatalf("aggregate hourly: %v", err)
		}
		if hourly.Total != 1 {
			t.Errorf("hourly total = %d, want 1 (só o evento de movimento, sem a transição de estado)", hourly.Total)
		}
	})
}
