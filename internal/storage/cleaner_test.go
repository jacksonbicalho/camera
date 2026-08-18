package storage_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"camera/internal/analysis"
	"camera/internal/config"
	"camera/internal/db"
	"camera/internal/detector"
	"camera/internal/notifications"
	"camera/internal/notifications/application"
	"camera/internal/storage"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// minimalValidMP4Bytes returns bytes of a structurally valid MP4 (has moov atom).
func minimalValidMP4Bytes() []byte {
	return []byte{
		0, 0, 0, 24, 'f', 't', 'y', 'p',
		'i', 's', 'o', 'm', 0, 0, 0, 0,
		'i', 's', 'o', 'm', 'm', 'p', '4', '1',
		0, 0, 0, 8, 'm', 'd', 'a', 't',
		0, 0, 0, 8, 'm', 'o', 'o', 'v',
	}
}

func writeFile(t *testing.T, path string, mtime time.Time) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	// MP4 files must contain a moov atom to pass syncRecordings validation.
	var content []byte
	if filepath.Ext(path) == ".mp4" {
		content = minimalValidMP4Bytes()
	} else {
		content = []byte("data")
	}
	if err := os.WriteFile(path, content, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, mtime, mtime); err != nil {
		t.Fatal(err)
	}
}

func writeCorruptMP4(t *testing.T, path string, mtime time.Time) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	// Simulates an MP4 written by ffmpeg that was killed before finalizing (no moov).
	if err := os.WriteFile(path, []byte("raw mdat data without moov atom"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, mtime, mtime); err != nil {
		t.Fatal(err)
	}
}

// mp4BytesWithDuration builds a minimal MP4 (ftyp+mdat+moov(mvhd)) whose mvhd
// (version 0) declares the given real duration — same box layout confirmed
// against real recordings from this project's recorder (mvhd v0, timescale
// 1000, mvhd as moov's first child). Only the fields storage.MP4Duration
// actually reads are populated; no matrix/pre_defined padding.
func mp4BytesWithDuration(d time.Duration) []byte {
	const timescale = 1000
	mvhdBody := make([]byte, 0, 20)
	mvhdBody = append(mvhdBody, 0, 0, 0, 0) // version(0) + flags
	mvhdBody = append(mvhdBody, 0, 0, 0, 0) // creation_time
	mvhdBody = append(mvhdBody, 0, 0, 0, 0) // modification_time
	ts := uint32(timescale)
	mvhdBody = append(mvhdBody, byte(ts>>24), byte(ts>>16), byte(ts>>8), byte(ts))
	dur := uint32(d.Seconds() * timescale)
	mvhdBody = append(mvhdBody, byte(dur>>24), byte(dur>>16), byte(dur>>8), byte(dur))

	mvhdSize := 8 + len(mvhdBody)
	mvhd := make([]byte, 0, mvhdSize)
	mvhd = append(mvhd, byte(mvhdSize>>24), byte(mvhdSize>>16), byte(mvhdSize>>8), byte(mvhdSize))
	mvhd = append(mvhd, 'm', 'v', 'h', 'd')
	mvhd = append(mvhd, mvhdBody...)

	moovSize := 8 + len(mvhd)
	moov := make([]byte, 0, moovSize)
	moov = append(moov, byte(moovSize>>24), byte(moovSize>>16), byte(moovSize>>8), byte(moovSize))
	moov = append(moov, 'm', 'o', 'o', 'v')
	moov = append(moov, mvhd...)

	b := []byte{
		0, 0, 0, 24, 'f', 't', 'y', 'p',
		'i', 's', 'o', 'm', 0, 0, 0, 0,
		'i', 's', 'o', 'm', 'm', 'p', '4', '1',
		0, 0, 0, 8, 'm', 'd', 'a', 't',
	}
	return append(b, moov...)
}

func writeMP4WithDuration(t *testing.T, path string, mtime time.Time, d time.Duration) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, mp4BytesWithDuration(d), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, mtime, mtime); err != nil {
		t.Fatal(err)
	}
}

func writeFileWithSize(t *testing.T, path string, size int) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, bytes.Repeat([]byte{0}, size), 0644); err != nil {
		t.Fatal(err)
	}
}

func writeMotionNDJSON(t *testing.T, dir string, events []time.Time) string {
	t.Helper()
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "motion.ndjson")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	for _, ts := range events {
		if err := enc.Encode(map[string]any{"time": ts.UTC().Format(time.RFC3339), "score": 0.05}); err != nil {
			t.Fatal(err)
		}
	}
	return path
}

func mp4WithTimestamp(dir, cameraID string, ts time.Time) string {
	day := ts.UTC().Format("2006/01/02")
	name := ts.UTC().Format("20060102150405") + ".mp4"
	return filepath.Join(dir, cameraID, day, name)
}

// sameDayBase mantém o setup de chunks adjacentes determinístico: testes ancoram
// o tempo em now-age e criam chunks em [base, base+span]; o cleaner agrupa MP4s por
// diretório YYYY/MM/DD, então se base e base+span caírem em dias UTC diferentes
// (base perto da meia-noite) os chunks vão para pastas distintas e a lógica de
// "próximo chunk" muda — tornando o teste flaky conforme o horário do relógio.
// Garante que [base, base+span] fique no mesmo dia UTC, sem afetar a idade da base.
func sameDayBase(now time.Time, age, span time.Duration) time.Time {
	const dayLayout = "2006/01/02"
	base := now.UTC().Add(-age).Truncate(time.Second)
	if base.Format(dayLayout) != base.Add(span).Format(dayLayout) {
		// base está a menos de `span` da meia-noite; recuar por `span` joga
		// base+span de volta para o mesmo dia (base original, pré-meia-noite).
		base = base.Add(-span)
	}
	return base
}

func TestSameDayBase_KeepsAdjacentChunksInSameUTCDay(t *testing.T) {
	const dayLayout = "2006/01/02"
	span := 1 * time.Minute
	// now tal que now-120min = 23:59:30 → base+span cruzaria a meia-noite.
	now := time.Date(2026, 6, 11, 1, 59, 30, 0, time.UTC)

	base := sameDayBase(now, 120*time.Minute, span)

	if base.Format(dayLayout) != base.Add(span).Format(dayLayout) {
		t.Fatalf("base %v e base+span %v caíram em dias UTC diferentes",
			base.Format(time.RFC3339), base.Add(span).Format(time.RFC3339))
	}
	// a base precisa continuar suficientemente no passado (além da retenção testada).
	if !base.Before(now.Add(-60 * time.Minute)) {
		t.Fatalf("base %v não está velha o suficiente em relação a now %v",
			base.Format(time.RFC3339), now.Format(time.RFC3339))
	}
}

func writeMotionNDJSONWithFrames(t *testing.T, dir string, events []struct {
	ts    time.Time
	frame string
}) string {
	t.Helper()
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "motion.ndjson")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	for _, ev := range events {
		entry := map[string]any{"time": ev.ts.UTC().Format(time.RFC3339), "score": 0.05}
		if ev.frame != "" {
			entry["frame"] = ev.frame
		}
		if err := enc.Encode(entry); err != nil {
			t.Fatal(err)
		}
	}
	return path
}

// --- RemoveEventsInRange ---

func TestRemoveEventsInRange_NoopWhenFileAbsent(t *testing.T) {
	err := storage.RemoveEventsInRange("/nonexistent/motion.ndjson", time.Now(), time.Now().Add(time.Minute))
	if err != nil {
		t.Errorf("expected nil error when file absent, got %v", err)
	}
}

func TestRemoveEventsInRange_RemovesEventsInsideWindow(t *testing.T) {
	dir := t.TempDir()
	base := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	writeMotionNDJSON(t, dir, []time.Time{
		base.Add(1 * time.Minute), // inside
		base.Add(6 * time.Minute), // outside (after window)
	})

	err := storage.RemoveEventsInRange(filepath.Join(dir, "motion.ndjson"), base, base.Add(5*time.Minute))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got := storage.HasMotionInRange(filepath.Join(dir, "motion.ndjson"), base, base.Add(5*time.Minute))
	if got {
		t.Error("expected no events inside window after removal")
	}
	still := storage.HasMotionInRange(filepath.Join(dir, "motion.ndjson"), base.Add(6*time.Minute), base.Add(10*time.Minute))
	if !still {
		t.Error("expected event outside window to be kept")
	}
}

func TestRemoveEventsInRange_DeletesNDJSONWhenAllEventsRemoved(t *testing.T) {
	dir := t.TempDir()
	base := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	ndjson := writeMotionNDJSON(t, dir, []time.Time{base.Add(time.Minute)})

	if err := storage.RemoveEventsInRange(ndjson, base, base.Add(5*time.Minute)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := os.Stat(ndjson); !os.IsNotExist(err) {
		t.Error("expected motion.ndjson to be deleted when empty")
	}
}

func TestRemoveEventsInRange_DeletesReferencedJPEGs(t *testing.T) {
	dir := t.TempDir()
	base := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	jpegName := "20260511100100_motion.jpg"
	jpegPath := filepath.Join(dir, jpegName)
	if err := os.WriteFile(jpegPath, []byte("img"), 0644); err != nil {
		t.Fatal(err)
	}
	writeMotionNDJSONWithFrames(t, dir, []struct {
		ts    time.Time
		frame string
	}{{ts: base.Add(time.Minute), frame: jpegName}})

	if err := storage.RemoveEventsInRange(filepath.Join(dir, "motion.ndjson"), base, base.Add(5*time.Minute)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := os.Stat(jpegPath); !os.IsNotExist(err) {
		t.Error("expected _motion.jpg to be deleted along with event")
	}
}

func TestRemoveEventsInRange_KeepsJPEGsOutsideWindow(t *testing.T) {
	dir := t.TempDir()
	base := time.Date(2026, 5, 11, 10, 0, 0, 0, time.UTC)
	jpegInside := "20260511100100_motion.jpg"
	jpegOutside := "20260511100700_motion.jpg"
	for _, name := range []string{jpegInside, jpegOutside} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("img"), 0644); err != nil {
			t.Fatal(err)
		}
	}
	writeMotionNDJSONWithFrames(t, dir, []struct {
		ts    time.Time
		frame string
	}{
		{ts: base.Add(1 * time.Minute), frame: jpegInside},
		{ts: base.Add(7 * time.Minute), frame: jpegOutside},
	})

	if err := storage.RemoveEventsInRange(filepath.Join(dir, "motion.ndjson"), base, base.Add(5*time.Minute)); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, jpegOutside)); err != nil {
		t.Error("expected JPEG outside window to be kept")
	}
	if _, err := os.Stat(filepath.Join(dir, jpegInside)); !os.IsNotExist(err) {
		t.Error("expected JPEG inside window to be deleted")
	}
}

// --- HasMotionInRange ---

func TestHasMotionInRange_WithEventInRange(t *testing.T) {
	dir := t.TempDir()
	ts := time.Now().UTC().Truncate(time.Second)
	start := ts.Add(-5 * time.Minute)
	end := ts.Add(5 * time.Minute)
	writeMotionNDJSON(t, dir, []time.Time{ts})

	got := storage.HasMotionInRange(filepath.Join(dir, "motion.ndjson"), start, end)

	if !got {
		t.Error("expected true: event is inside range")
	}
}

func TestHasMotionInRange_WithEventOutsideRange(t *testing.T) {
	dir := t.TempDir()
	ts := time.Now().UTC().Truncate(time.Second)
	start := ts.Add(5 * time.Minute)
	end := ts.Add(10 * time.Minute)
	writeMotionNDJSON(t, dir, []time.Time{ts})

	got := storage.HasMotionInRange(filepath.Join(dir, "motion.ndjson"), start, end)

	if got {
		t.Error("expected false: event is outside range")
	}
}

func TestHasMotionInRange_AtBoundaryStartIncluded(t *testing.T) {
	dir := t.TempDir()
	ts := time.Now().UTC().Truncate(time.Second)
	writeMotionNDJSON(t, dir, []time.Time{ts})

	got := storage.HasMotionInRange(filepath.Join(dir, "motion.ndjson"), ts, ts.Add(5*time.Minute))

	if !got {
		t.Error("expected true: event at start boundary is included [start, end)")
	}
}

func TestHasMotionInRange_AtBoundaryEndExcluded(t *testing.T) {
	dir := t.TempDir()
	ts := time.Now().UTC().Truncate(time.Second)
	writeMotionNDJSON(t, dir, []time.Time{ts})

	got := storage.HasMotionInRange(filepath.Join(dir, "motion.ndjson"), ts.Add(-5*time.Minute), ts)

	if got {
		t.Error("expected false: event at end boundary is excluded [start, end)")
	}
}

func TestHasMotionInRange_NoFileReturnsFalse(t *testing.T) {
	got := storage.HasMotionInRange("/nonexistent/motion.ndjson", time.Now(), time.Now().Add(time.Minute))
	if got {
		t.Error("expected false when ndjson file does not exist")
	}
}

func TestHasMotionInRange_EmptyFileReturnsFalse(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "motion.ndjson")
	if err := os.WriteFile(path, nil, 0644); err != nil {
		t.Fatal(err)
	}
	got := storage.HasMotionInRange(path, time.Now(), time.Now().Add(time.Minute))
	if got {
		t.Error("expected false for empty ndjson")
	}
}

// --- ChunkStartFromName ---

func TestChunkStartFromName_ValidName(t *testing.T) {
	got, err := storage.ChunkStartFromName("20260509120000.mp4")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 5, 9, 12, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("expected %v, got %v", want, got)
	}
}

func TestChunkStartFromName_InvalidName(t *testing.T) {
	_, err := storage.ChunkStartFromName("recording.mp4")
	if err == nil {
		t.Error("expected error for non-timestamp filename")
	}
}

func TestChunkStartFromName_StripsExtension(t *testing.T) {
	got, err := storage.ChunkStartFromName("20260101000000.mp4")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Errorf("expected %v, got %v", want, got)
	}
}

// --- Clean with differentiated retention ---

func TestClean_DeletesWithoutMotionChunkAfterWithoutMotionRetention(t *testing.T) {
	dir := t.TempDir()
	chunkStart := time.Now().UTC().Add(-31 * time.Minute).Truncate(time.Second)
	path := mp4WithTimestamp(dir, "cam1", chunkStart)
	writeFile(t, path, chunkStart)
	// no motion.ndjson → no motion

	storage.New(dir, 10080, 30, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("expected without-motion chunk to be deleted after without_motion retention")
	}
}

func TestClean_KeepsWithMotionChunkAfterWithoutMotionRetention(t *testing.T) {
	dir := t.TempDir()
	chunkStart := time.Now().UTC().Add(-31 * time.Minute).Truncate(time.Second)
	path := mp4WithTimestamp(dir, "cam1", chunkStart)
	writeFile(t, path, chunkStart)
	// write motion event inside chunk range
	writeMotionNDJSON(t, filepath.Dir(path), []time.Time{chunkStart.Add(1 * time.Minute)})

	storage.New(dir, 10080, 30, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(path); err != nil {
		t.Errorf("expected with-motion chunk to be kept (within with_motion retention): %v", err)
	}
}

func TestClean_DeletesWithMotionChunkAfterWithMotionRetention(t *testing.T) {
	dir := t.TempDir()
	chunkStart := time.Now().UTC().Add(-61 * time.Minute).Truncate(time.Second)
	path := mp4WithTimestamp(dir, "cam1", chunkStart)
	writeFile(t, path, chunkStart)
	writeMotionNDJSON(t, filepath.Dir(path), []time.Time{chunkStart.Add(1 * time.Minute)})

	storage.New(dir, 60, 30, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("expected with-motion chunk to be deleted after with_motion retention")
	}
}

// --- Clean: inferência de chunkEnd pelo arquivo seguinte ---

// Chunk A (1 min) sem motion; evento de motion no chunk B seguinte.
// Com a janela correta (até o início de B), A não deve ser classificado como "com motion".
func TestClean_AdjacentMotionEventDoesNotContaminateEarlierChunk(t *testing.T) {
	dir := t.TempDir()
	// sameDayBase mantém A e B no mesmo dia UTC; o caminho FS (sem banco) agrupa
	// por diretório YYYY/MM/DD e flakearia se a base caísse na virada de dia.
	base := sameDayBase(time.Now().UTC(), 120*time.Minute, 1*time.Minute)
	chunkA := base
	chunkB := base.Add(1 * time.Minute)

	pathA := mp4WithTimestamp(dir, "cam1", chunkA)
	pathB := mp4WithTimestamp(dir, "cam1", chunkB)
	writeFile(t, pathA, chunkA)
	writeFile(t, pathB, chunkB)

	// evento de motion aos 10s dentro do chunk B → fora da janela de A (1 min)
	writeMotionNDJSON(t, filepath.Dir(pathA), []time.Time{chunkB.Add(10 * time.Second)})

	// fallback de 5 min; sem ele o bug existia porque 5 min cobria o evento de B
	storage.New(dir, 0, 60, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(pathA); !os.IsNotExist(err) {
		t.Error("chunk A sem motion deveria ter sido deletado, mas foi retido (janela alargada)")
	}
	if _, err := os.Stat(pathB); err != nil {
		t.Errorf("chunk B com motion deveria ser mantido: %v", err)
	}
}

// Chunk com motion real dentro do seu próprio intervalo deve ser retido.
func TestClean_MotionInsideChunkWindowKeepsChunk(t *testing.T) {
	dir := t.TempDir()
	// sameDayBase mantém A e B no mesmo dia UTC (caminho FS, ver teste acima).
	base := sameDayBase(time.Now().UTC(), 120*time.Minute, 1*time.Minute)
	chunkA := base
	chunkB := base.Add(1 * time.Minute)

	pathA := mp4WithTimestamp(dir, "cam1", chunkA)
	pathB := mp4WithTimestamp(dir, "cam1", chunkB)
	writeFile(t, pathA, chunkA)
	writeFile(t, pathB, chunkB)

	// evento de motion aos 30s dentro do chunk A → dentro da janela de A
	writeMotionNDJSON(t, filepath.Dir(pathA), []time.Time{chunkA.Add(30 * time.Second)})

	storage.New(dir, 0, 60, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(pathA); err != nil {
		t.Errorf("chunk A com motion real deveria ser mantido: %v", err)
	}
}

// Último arquivo do diretório (sem próximo) usa fallbackDuration; deve ser deletado se expirado.
func TestClean_LastChunkInDirUsesFallbackDuration(t *testing.T) {
	dir := t.TempDir()
	chunkStart := time.Now().UTC().Add(-120 * time.Minute).Truncate(time.Second)
	path := mp4WithTimestamp(dir, "cam1", chunkStart)
	writeFile(t, path, chunkStart)
	// sem motion.ndjson; fallback de 5 min não alcança nenhum evento

	storage.New(dir, 0, 60, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("último chunk sem motion deveria ter sido deletado usando fallback duration")
	}
}

func TestClean_KeepsWithMotionChunkWhenWithMotionMinutesIsZero(t *testing.T) {
	dir := t.TempDir()
	chunkStart := time.Now().UTC().Add(-365 * 24 * time.Hour).Truncate(time.Second)
	path := mp4WithTimestamp(dir, "cam1", chunkStart)
	writeFile(t, path, chunkStart)
	writeMotionNDJSON(t, filepath.Dir(path), []time.Time{chunkStart.Add(1 * time.Minute)})

	// withMotion=0 → keep motion recordings indefinitely
	storage.New(dir, 0, 1440, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(path); err != nil {
		t.Errorf("expected motion chunk to be kept when with_motion_minutes=0: %v", err)
	}
}

// --- Existing tests (updated for new signature) ---

func TestClean_DeletesOldFiles(t *testing.T) {
	dir := t.TempDir()
	chunkStart := time.Now().UTC().Add(-31 * time.Minute).Truncate(time.Second)
	old := mp4WithTimestamp(dir, "cam1", chunkStart)
	writeFile(t, old, chunkStart)

	storage.New(dir, 30, 30, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Error("expected old file to be deleted")
	}
}

func TestClean_KeepsRecentFiles(t *testing.T) {
	dir := t.TempDir()
	chunkStart := time.Now().UTC().Add(-1 * time.Minute).Truncate(time.Second)
	recent := mp4WithTimestamp(dir, "cam1", chunkStart)
	writeFile(t, recent, chunkStart)

	storage.New(dir, 30, 30, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(recent); err != nil {
		t.Errorf("expected recent file to exist: %v", err)
	}
}

func TestClean_DisabledWhenRetentionMinutesZero(t *testing.T) {
	dir := t.TempDir()
	chunkStart := time.Now().UTC().Add(-365 * 24 * time.Hour).Truncate(time.Second)
	old := mp4WithTimestamp(dir, "cam1", chunkStart)
	writeFile(t, old, chunkStart)

	storage.New(dir, 0, 0, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(old); err != nil {
		t.Errorf("expected file to exist when retention disabled: %v", err)
	}
}

func TestClean_IgnoresNonMp4Files(t *testing.T) {
	dir := t.TempDir()
	ts := filepath.Join(dir, "cam1", "2026", "01", "01", "001.ts")
	writeFile(t, ts, time.Now().Add(-31*time.Minute))

	storage.New(dir, 30, 30, 5*time.Minute, 0, 0, nil, discardLogger()).Clean()

	if _, err := os.Stat(ts); err != nil {
		t.Errorf("expected non-mp4 file to be preserved: %v", err)
	}
}

func TestCheckSize_LogsWarnWhenAboveThreshold(t *testing.T) {
	dir := t.TempDir()
	// 200 bytes total; maxSizeGB ~107 bytes, 70% threshold ~75 bytes → should warn
	writeFileWithSize(t, filepath.Join(dir, "cam1", "file1.mp4"), 100)
	writeFileWithSize(t, filepath.Join(dir, "cam1", "file2.mp4"), 100)

	var buf bytes.Buffer
	log := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn}))

	const maxSizeGB = 1e-7 // ~107 bytes
	storage.New(dir, 0, 0, 5*time.Minute, maxSizeGB, 70, nil, log).CheckSize()

	if !strings.Contains(buf.String(), "storage usage high") {
		t.Errorf("expected storage usage warning, got: %s", buf.String())
	}
}

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

func queryEndedAt(t *testing.T, database *db.DB, path string) sql.NullString {
	t.Helper()
	var endedAt sql.NullString
	err := database.QueryRow(`SELECT ended_at FROM recordings WHERE path=?`, path).Scan(&endedAt)
	if err != nil {
		t.Fatalf("query ended_at for %s: %v", path, err)
	}
	return endedAt
}

// configureCameraDetector registers an object detector and points a
// camera's analysis config at it (enabled), the per-camera equivalent of
// what tests used to do via the now-retired global video_analysis_config
// enable/threshold gate.
func configureCameraDetector(t *testing.T, database *db.DB, cameraID, serviceURL, model string, threshold float64) {
	t.Helper()
	detID, err := db.InsertObjectDetector(database, cameraID+"-detector", map[string]string{
		"service_url": serviceURL,
		"model":       model,
	})
	if err != nil {
		t.Fatalf("InsertObjectDetector: %v", err)
	}
	if err := db.SetCameraAnalysisConfig(database, cameraID, db.CameraAnalysisConfig{
		Enabled:             true,
		DetectorID:          &detID,
		ConfidenceThreshold: &threshold,
	}); err != nil {
		t.Fatalf("SetCameraAnalysisConfig: %v", err)
	}
}

func createTestCamera(t *testing.T, database *db.DB, id string) {
	t.Helper()
	dur5m := config.Duration(5 * time.Minute)
	dur30s := config.Duration(30 * time.Second)
	cam := config.CameraConfig{
		ID:                id,
		RTSPURL:           "rtsp://localhost/" + id,
		ChunkDuration:     dur5m,
		ReconnectInterval: dur30s,
	}
	cam.ID = id
	if _, err := db.CreateCamera(database, cam, nil); err != nil {
		t.Fatalf("create camera %s: %v", id, err)
	}
}

// Quando syncRecordings insere um arquivo como último (ended_at NULL) e depois
// um sucessor aparece, a segunda execução deve preencher o ended_at do primeiro.
func TestSyncRecordings_UpdatesEndedAtWhenSuccessorAppears(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	writeFile(t, pathA, base)

	// Primeiro sync: só arquivo A → inserido com ended_at = NULL
	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if got := queryEndedAt(t, database, pathA); got.Valid {
		t.Errorf("após primeiro sync ended_at deveria ser NULL, mas é %s", got.String)
	}

	// Arquivo B aparece
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
	writeFile(t, pathB, base.Add(5*time.Minute))

	// Segundo sync: A deve ter ended_at preenchido com o início de B
	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	got := queryEndedAt(t, database, pathA)
	if !got.Valid {
		t.Fatal("ended_at continua NULL após o sucessor aparecer; INSERT OR IGNORE não está sendo compensado com UPDATE")
	}
	want := base.Add(5 * time.Minute).UTC().Format(time.RFC3339)
	if got.String != want {
		t.Errorf("ended_at = %s, want %s", got.String, want)
	}
}

// TestSyncRecordingsEndedAt cobre a história fix/ended-at-duracao-real: com um
// gap de reconexão real entre dois chunks (sucessor bem mais tarde que a
// duração real do primeiro), ended_at deve refletir a duração REAL do
// arquivo (via mvhd), não o início do sucessor.
func TestSyncRecordingsEndedAt(t *testing.T) {
	t.Run("CA3: ended_at reflete duração real quando há gap de reconexão", func(t *testing.T) {
		dir := t.TempDir()
		database := openTestDB(t)
		createTestCamera(t, database, "cam1")

		base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
		// Chunk A: nome/started_at em `base`, mas conteúdo real de só 5s (mvhd) —
		// simula a câmera caindo logo após começar a gravar.
		pathA := mp4WithTimestamp(dir, "cam1", base)
		writeMP4WithDuration(t, pathA, base, 5*time.Second)

		// Chunk B só reconecta 3 minutos depois — gap real, não os 5s de A.
		pathB := mp4WithTimestamp(dir, "cam1", base.Add(3*time.Minute))
		writeFile(t, pathB, base.Add(3*time.Minute))

		storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

		got := queryEndedAt(t, database, pathA)
		if !got.Valid {
			t.Fatal("ended_at de pathA está NULL — deveria ter sido preenchido (B já existe)")
		}
		want := base.Add(5 * time.Second).UTC().Format(time.RFC3339)
		if got.String != want {
			t.Errorf("ended_at = %s, want %s (duração real do arquivo, não o início de B em %s)",
				got.String, want, base.Add(3*time.Minute).UTC().Format(time.RFC3339))
		}
	})
}

// TestSyncRecordings_SelfCorrectsStaleEndedAt cobre a história
// feat/badge-momento-sem-gravacao (T5): um ended_at gravado errado (ex.: por
// um ciclo anterior a fix/ended-at-duracao-real, ou por MP4Duration ter
// falhado pontualmente naquele ciclo) não pode ficar congelado pra sempre —
// UpdateRecordingEndedAt tinha guard `WHERE ended_at IS NULL`, e uma vez
// setado (certo ou errado) nenhum ciclo seguinte conseguia corrigi-lo, mesmo
// syncRecordings recalculando MP4Duration a cada ciclo, pra todo chunk
// fechado (o I/O sempre aconteceu; só a escrita nunca aplicava a correção).
func TestSyncRecordings_SelfCorrectsStaleEndedAt(t *testing.T) {
	t.Run("CA7: ended_at inflado (congelado por um ciclo antigo) é corrigido pra baixo num ciclo seguinte", func(t *testing.T) {
		dir := t.TempDir()
		database := openTestDB(t)
		createTestCamera(t, database, "cam1")

		base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
		// Chunk A: nome/started_at em `base`, conteúdo real de só 5s (mvhd) —
		// mesma câmera instável de TestSyncRecordingsEndedAt.
		pathA := mp4WithTimestamp(dir, "cam1", base)
		writeMP4WithDuration(t, pathA, base, 5*time.Second)

		// Sucessor 3 minutos depois — gap real, wall-clock inflado.
		pathB := mp4WithTimestamp(dir, "cam1", base.Add(3*time.Minute))
		writeFile(t, pathB, base.Add(3*time.Minute))

		// Simula o congelamento: a linha de A já existe no banco com o
		// ended_at ERRADO (wall-clock, início de B) — como se um ciclo antigo
		// (antes da correção de duração real, ou uma falha pontual de
		// MP4Duration naquele ciclo específico) já tivesse gravado.
		if err := db.InsertRecording(database, db.Recording{
			CameraID: "cam1", StartedAt: base, EndedAt: base.Add(3 * time.Minute), Path: pathA,
		}); err != nil {
			t.Fatal(err)
		}

		storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

		got := queryEndedAt(t, database, pathA)
		if !got.Valid {
			t.Fatal("ended_at de pathA ficou NULL — não deveria, já havia sucessor")
		}
		want := base.Add(5 * time.Second).UTC().Format(time.RFC3339)
		if got.String != want {
			t.Errorf("ended_at = %s, want %s (duração real do arquivo) — valor errado congelado não foi autocorrigido",
				got.String, want)
		}
	})

	t.Run("CA7: ended_at já menor que o recém-medido nunca é sobrescrito pra cima", func(t *testing.T) {
		dir := t.TempDir()
		database := openTestDB(t)
		createTestCamera(t, database, "cam1")

		base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
		// Duração real do arquivo (mvhd) é 8s — o que syncRecordings VAI
		// recalcular neste ciclo, se pudesse escrever.
		pathA := mp4WithTimestamp(dir, "cam1", base)
		writeMP4WithDuration(t, pathA, base, 8*time.Second)
		pathB := mp4WithTimestamp(dir, "cam1", base.Add(3*time.Minute))
		writeFile(t, pathB, base.Add(3*time.Minute))

		// Linha já com um valor MENOR (2s) que o recém-medido (8s) — nunca pode
		// crescer de volta. Sem o guard "ended_at > ?" este teste falharia:
		// ended_at subiria de 2s pra 8s.
		smallerEnded := base.Add(2 * time.Second)
		if err := db.InsertRecording(database, db.Recording{
			CameraID: "cam1", StartedAt: base, EndedAt: smallerEnded, Path: pathA,
		}); err != nil {
			t.Fatal(err)
		}

		storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

		got := queryEndedAt(t, database, pathA)
		if !got.Valid {
			t.Fatal("ended_at de pathA ficou NULL")
		}
		want := smallerEnded.UTC().Format(time.RFC3339)
		if got.String != want {
			t.Errorf("ended_at = %s, want %s (valor já menor não deveria crescer pra cima)", got.String, want)
		}
	})
}

// Quando um chunk começa no fim de um dia UTC e o sucessor cai no dia
// seguinte (pastas YYYY/MM/DD diferentes), o syncRecordings ainda precisa
// linkar os dois — usa cameraID, não diretório, pra agrupar.
func TestSyncRecordings_LinksChunksAcrossMidnight(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	// Ancorado em ontem 00:00 UTC para cruzar uma meia-noite recente sem que os
	// chunks envelheçam além da retenção (datas absolutas viravam time-bomb).
	midnight := time.Now().UTC().Truncate(24 * time.Hour).Add(-24 * time.Hour)
	beforeMidnight := midnight.Add(-2 * time.Minute) // anteontem 23:58 UTC
	afterMidnight := midnight.Add(3 * time.Minute)   // ontem 00:03 UTC

	pathA := mp4WithTimestamp(dir, "cam1", beforeMidnight)
	pathB := mp4WithTimestamp(dir, "cam1", afterMidnight)
	writeFile(t, pathA, beforeMidnight)
	writeFile(t, pathB, afterMidnight)

	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	got := queryEndedAt(t, database, pathA)
	if !got.Valid {
		t.Fatal("ended_at de pathA continua NULL: syncRecordings não linkou chunks que cruzam meia-noite UTC")
	}
	want := afterMidnight.Format(time.RFC3339)
	if got.String != want {
		t.Errorf("ended_at de pathA = %s, want %s", got.String, want)
	}
}

// createTestCameraWithMotion cria câmera com lead e trail configurados.
func createTestCameraWithMotion(t *testing.T, database *db.DB, id string, lead, trail int) {
	t.Helper()
	dur5m := config.Duration(5 * time.Minute)
	dur30s := config.Duration(30 * time.Second)
	cam := config.CameraConfig{
		ID:                id,
		RTSPURL:           "rtsp://localhost/" + id,
		ChunkDuration:     dur5m,
		ReconnectInterval: dur30s,
	}
	motion := &config.MotionConfig{
		Enabled:              true,
		Threshold:            0.05,
		PlaybackLeadSeconds:  lead,
		PlaybackTrailSeconds: trail,
	}
	if _, err := db.CreateCamera(database, cam, motion); err != nil {
		t.Fatalf("create camera %s: %v", id, err)
	}
}

// Chunk imediatamente após um evento deve ser marcado has_motion=1 quando
// o evento cai dentro da janela de trail do chunk seguinte.
// Chunk C é necessário para que B receba ended_at; sem ended_at o chunk
// não pode ser avaliado (está sendo gravado).
func TestSyncRecordings_TrailWindowMarksNextChunk(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 10, 10)

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	// Chunk A: [base, base+5s)  — contém o evento (1s antes do fim)
	// Chunk B: [base+5s, base+10s) — não contém evento, mas está dentro de trail=10s
	// Chunk C: [base+10s, ...) — presença de C define o ended_at de B
	chunkA := base
	chunkB := base.Add(5 * time.Second)
	chunkC := base.Add(10 * time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", chunkA)
	pathB := mp4WithTimestamp(dir, "cam1", chunkB)
	pathC := mp4WithTimestamp(dir, "cam1", chunkC)
	writeFile(t, pathA, chunkA)
	writeFile(t, pathB, chunkB)
	writeFile(t, pathC, chunkC)

	// evento 1s antes do fim de A → aftermath está em B
	evTime := chunkA.Add(4 * time.Second)
	addMotionEvent(t, database, "cam1", evTime, 0.1)

	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if !hasMotionInDB(t, database, pathA) {
		t.Error("chunk A deveria ter has_motion=1 (contém o evento)")
	}
	if !hasMotionInDB(t, database, pathB) {
		t.Error("chunk B deveria ter has_motion=1 (está dentro do trail do evento)")
	}
}

// Chunk muito depois do evento (além do trail) não deve ser marcado.
func TestSyncRecordings_ChunkBeyondTrailNotMarked(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 10, 10)

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	// Chunk A: contém o evento
	// Chunk C: começa 30s após o evento → fora do trail de 10s
	chunkA := base
	chunkC := base.Add(30 * time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", chunkA)
	pathC := mp4WithTimestamp(dir, "cam1", chunkC)
	writeFile(t, pathA, chunkA)
	writeFile(t, pathC, chunkC)

	evTime := chunkA.Add(2 * time.Second)
	addMotionEvent(t, database, "cam1", evTime, 0.1)

	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if !hasMotionInDB(t, database, pathA) {
		t.Error("chunk A deveria ter has_motion=1")
	}
	if hasMotionInDB(t, database, pathC) {
		t.Error("chunk C deveria ter has_motion=0 (além do trail)")
	}
}

func addMotionEvent(t *testing.T, database *db.DB, cameraID string, ts time.Time, score float64) {
	t.Helper()
	_, err := database.Exec(
		`INSERT INTO motion_events(camera_id, occurred_at, score) VALUES(?,?,?)`,
		cameraID, ts.UTC().Format(time.RFC3339), score,
	)
	if err != nil {
		t.Fatalf("insert motion event: %v", err)
	}
}

func hasMotionInDB(t *testing.T, database *db.DB, path string) bool {
	t.Helper()
	var v int
	if err := database.QueryRow(`SELECT has_motion FROM recordings WHERE path=?`, path).Scan(&v); err != nil {
		t.Fatalf("query has_motion for %s: %v", path, err)
	}
	return v != 0
}

// TestSyncRecordings_DoesNotMarkNullEndedAtAsHasMotion verifica que uma gravação
// com ended_at=NULL não recebe has_motion=1 mesmo quando há eventos de movimento
// após o início da gravação. O estado NULL indica que a gravação ainda está em
// andamento — não há como saber se o evento pertence a ela.
func TestSyncRecordings_DoesNotMarkNullEndedAtAsHasMotion(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 10, 10)

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	// Único arquivo na pasta: ended_at permanece NULL (não há arquivo seguinte).
	path := mp4WithTimestamp(dir, "cam1", base)
	writeFile(t, path, base)

	// Evento após o início da gravação — com o bug, isso marca has_motion=1.
	addMotionEvent(t, database, "cam1", base.Add(2*time.Minute), 0.1)

	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if hasMotionInDB(t, database, path) {
		t.Error("gravação com ended_at=NULL não deve receber has_motion=1")
	}
}

// TestCleanFromDB_PurgesOrphanedMotionEvents verifica que eventos de movimento
// sem cobertura de nenhuma gravação (órfãos) são removidos após a gravação
// relacionada ser deletada pela regra de retenção.
func TestCleanFromDB_PurgesOrphanEventAfterRecordingsDeleted(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	// lead=30s: evento 5s antes de A começa marca A com has_motion via lead
	createTestCameraWithMotion(t, database, "cam1", 30, 10)

	base := time.Now().UTC().Add(-120 * time.Minute).Truncate(time.Second)

	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(10*time.Second))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(10*time.Second))

	// Evento 5s ANTES de A começar: fora do intervalo exato de A [base, base+10s),
	// mas dentro da janela de lead (30s) → A será marcado has_motion=1.
	evOrphan := base.Add(-5 * time.Second)
	addMotionEvent(t, database, "cam1", evOrphan, 0.1)

	// Primeiro ciclo (retenção longa): sincroniza, marca has_motion e preserva tudo.
	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if !hasMotionInDB(t, database, pathA) {
		t.Fatal("pathA deve ter has_motion=1 (evento dentro da janela de lead)")
	}

	// Segundo ciclo (retenção curta): deleta ambas as gravações (120min > 60min).
	storage.New(dir, 60, 60, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(pathA); !os.IsNotExist(err) {
		t.Fatal("pathA deveria ter sido deletado")
	}

	// Sem gravação cobrindo o evento e além da retenção → purgeOrphanEvents o remove.
	var count int
	database.QueryRow(`SELECT COUNT(*) FROM motion_events WHERE camera_id='cam1'`).Scan(&count)
	if count != 0 {
		t.Errorf("evento órfão além da retenção deveria ter sido purgado, count=%d", count)
	}
}

// setupS3RetentionFixture cria uma câmera, um destino S3 apontado pro
// httptest.Server dado, e uma retention_config "without_motion" ->
// send_to_drive apontando pra esse destino. Não mexe em db.SetExtensionActive
// — cada teste decide o valor que quer exercitar.
func setupS3RetentionFixture(t *testing.T, database *db.DB, s3Endpoint string) {
	t.Helper()
	createTestCameraWithMotion(t, database, "cam1", 30, 10)
	ext, err := db.InsertRetentionExtension(database, db.RetentionExtension{
		Name:      "meu-s3",
		Type:      "s3",
		Endpoint:  s3Endpoint,
		Bucket:    "bucket",
		Region:    "us-east-1",
		AccessKey: "AK",
		SecretKey: "SK",
	})
	if err != nil {
		t.Fatalf("InsertRetentionExtension: %v", err)
	}
	if err := db.UpdateRetentionConfig(database, db.RetentionConfig{
		Category:             "without_motion",
		Action:               "send_to_drive",
		RetentionExtensionID: ext.ID,
	}); err != nil {
		t.Fatalf("UpdateRetentionConfig: %v", err)
	}
}

// TestCleanFromDB_S3ExtensionDisabled_DoesNotUploadOrDelete é a regressão do
// achado real: loadDrives() montava o drive S3 só a partir da existência da
// config salva, ignorando db.GetExtensionActive — desativar a extensão na UI
// não tinha efeito nenhum no Cleaner, e uploads continuavam acontecendo.
func TestCleanFromDB_S3ExtensionDisabled_DoesNotUploadOrDelete(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)

	var uploadCalled bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uploadCalled = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	setupS3RetentionFixture(t, database, srv.URL)
	if err := db.SetExtensionActive(database, "s3", false); err != nil {
		t.Fatalf("SetExtensionActive: %v", err)
	}

	base := time.Now().UTC().Add(-120 * time.Minute).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(10*time.Second))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(10*time.Second))

	storage.New(dir, 10080, 60, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if uploadCalled {
		t.Error("esperado NENHUM upload pro S3 com a extensão desativada")
	}
	if _, err := os.Stat(pathA); err != nil {
		t.Errorf("esperado pathA RETIDO (não deletado) com S3 desativado e action=send_to_drive, got: %v", err)
	}
}

// TestCleanFromDB_S3ExtensionEnabled_UploadsAndDeletes é o controle positivo
// do teste acima — confirma que a checagem nova (db.GetExtensionActive) não
// quebrou o caminho normal (extensão ativa continua fazendo upload+delete).
func TestCleanFromDB_S3ExtensionEnabled_UploadsAndDeletes(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)

	var uploadCalled bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uploadCalled = true
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	setupS3RetentionFixture(t, database, srv.URL)
	if err := db.SetExtensionActive(database, "s3", true); err != nil {
		t.Fatalf("SetExtensionActive: %v", err)
	}

	base := time.Now().UTC().Add(-120 * time.Minute).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(10*time.Second))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(10*time.Second))

	storage.New(dir, 10080, 60, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if !uploadCalled {
		t.Error("esperado um upload pro S3 com a extensão ativada")
	}
	if _, err := os.Stat(pathA); !os.IsNotExist(err) {
		t.Errorf("esperado pathA deletado após upload bem-sucedido, got err=%v", err)
	}
}

func TestCheckSize_NoWarnWhenBelowThreshold(t *testing.T) {
	dir := t.TempDir()
	// 50 bytes total; maxSizeGB ~107 bytes, 70% threshold ~75 bytes → no warn
	writeFileWithSize(t, filepath.Join(dir, "cam1", "file1.mp4"), 50)

	var buf bytes.Buffer
	log := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn}))

	const maxSizeGB = 1e-7 // ~107 bytes
	storage.New(dir, 0, 0, 5*time.Minute, maxSizeGB, 70, nil, log).CheckSize()

	if strings.Contains(buf.String(), "storage usage high") {
		t.Errorf("unexpected storage usage warning below threshold")
	}
}

// O arquivo mais recente de cada câmera tem ended_at IS NULL enquanto o próximo
// não aparece. O cleaner não deve deletá-lo nem enviá-lo ao drive — ele ainda
// está sendo gravado.
// Quando o cleaner deleta uma gravação com motion, deve também apagar os JPEGs
// de evento referenciados no banco e remover as linhas de motion_events.
func TestClean_PurgesMotionJPEGsOnDelete(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 0, 0)

	base := time.Now().UTC().Add(-120 * time.Minute).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(time.Minute))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(time.Minute))

	// evento com frame_path dentro da janela de A
	evTime := base.Add(10 * time.Second)
	jpegName := evTime.UTC().Format("20060102150405") + "_motion.jpg"
	jpegPath := filepath.Join(filepath.Dir(pathA), jpegName)
	writeFile(t, jpegPath, evTime)

	_, err := database.Exec(
		`INSERT INTO motion_events(camera_id, occurred_at, score, frame_path) VALUES(?,?,?,?)`,
		"cam1", evTime.UTC().Format(time.RFC3339), 0.1, jpegName,
	)
	if err != nil {
		t.Fatalf("insert motion event: %v", err)
	}

	// retenção de 60 min com e sem motion → A (com motion) será deletado
	storage.New(dir, 60, 60, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(jpegPath); !os.IsNotExist(err) {
		t.Error("_motion.jpg deve ser apagado junto com a gravação")
	}
	var count int
	database.QueryRow(`SELECT COUNT(*) FROM motion_events WHERE camera_id='cam1'`).Scan(&count)
	if count != 0 {
		t.Errorf("motion_events deve estar vazio após purge, mas tem %d linhas", count)
	}
}

// TestClean_PurgesCleanFrameCompanionOnDelete: todo evento de movimento salva
// DOIS jpgs no mesmo instante — o `_motion.jpg` anotado (com bbox/score,
// rastreado em motion_events.frame_path) e um `_frame.jpg` limpo, companion,
// usado pelo picker do carrossel (internal/motion/detector.go, saveSnapshot)
// — mas o `_frame.jpg` NUNCA é gravado no banco, só existe em disco. Purgar o
// evento via purgeMotionAssets/removeEventJPEGs só removia o `_motion.jpg`,
// deixando o `_frame.jpg` companion órfão pra sempre (achado real: diretórios
// de 20+ dias cheios só de `_frame.jpg`, reportado pelo navigator).
func TestClean_PurgesCleanFrameCompanionOnDelete(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 0, 0)

	base := time.Now().UTC().Add(-120 * time.Minute).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(time.Minute))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(time.Minute))

	evTime := base.Add(10 * time.Second)
	jpegName := evTime.UTC().Format("20060102150405") + "_motion.jpg"
	jpegPath := filepath.Join(filepath.Dir(pathA), jpegName)
	framePath := filepath.Join(filepath.Dir(pathA), evTime.UTC().Format("20060102150405")+"_frame.jpg")
	writeFile(t, jpegPath, evTime)
	writeFile(t, framePath, evTime)

	_, err := database.Exec(
		`INSERT INTO motion_events(camera_id, occurred_at, score, frame_path) VALUES(?,?,?,?)`,
		"cam1", evTime.UTC().Format(time.RFC3339), 0.1, jpegName,
	)
	if err != nil {
		t.Fatalf("insert motion event: %v", err)
	}

	storage.New(dir, 60, 60, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(jpegPath); !os.IsNotExist(err) {
		t.Error("_motion.jpg deve ser apagado junto com a gravação")
	}
	if _, err := os.Stat(framePath); !os.IsNotExist(err) {
		t.Error("_frame.jpg companion deve ser apagado junto com o _motion.jpg")
	}
}

// TestSyncRecordings_ResetsHasMotionWhenEventsDeleted verifica que syncRecordings
// reseta has_motion=0 para gravações cujos eventos foram deletados fora do ciclo
// normal de limpeza (ex: via bulk delete pela API).
func TestSyncRecordings_ResetsHasMotionWhenEventsDeleted(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 0, 0)

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(5*time.Minute))

	addMotionEvent(t, database, "cam1", base.Add(2*time.Minute), 0.5)

	// Primeiro ciclo: A recebe has_motion=1 via syncRecordings.
	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()
	if !hasMotionInDB(t, database, pathA) {
		t.Fatal("pathA deve ter has_motion=1 após sync")
	}

	// Simula bulk delete de eventos via API (exclui evento sem apagar gravação).
	if _, err := database.Exec(`DELETE FROM motion_events WHERE camera_id='cam1'`); err != nil {
		t.Fatal(err)
	}

	// Segundo ciclo: syncRecordings deve resetar has_motion=0 para A.
	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()
	if hasMotionInDB(t, database, pathA) {
		t.Error("pathA deve ter has_motion=0 após todos os eventos serem deletados")
	}
}

func TestClean_DoesNotDeleteCurrentRecording(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	// Único arquivo na pasta: sem succeeded, ended_at ficará NULL após sync.
	chunkStart := time.Now().UTC().Add(-30 * time.Minute).Truncate(time.Second)
	path := mp4WithTimestamp(dir, "cam1", chunkStart)
	writeFile(t, path, chunkStart)

	// Retenção curta (1 min) sem motion: sem ended_at o arquivo não deve ser deletado.
	storage.New(dir, 0, 1, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(path); err != nil {
		t.Errorf("arquivo corrente (ended_at NULL) não deve ser deletado: %v", err)
	}
}

func TestAnalyzeNewRecordings_AnalyzesCompletedChunks(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 10, 10)
	configureCameraDetector(t, database, "cam1", "http://yolo:8000", "yolov8n", 0.4)

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(5*time.Minute))

	// Motion event within pathA's range so syncRecordings sets has_motion=1.
	if err := db.InsertMotionEvent(database, db.MotionEvent{
		CameraID:   "cam1",
		OccurredAt: base.Add(time.Minute),
		Score:      0.5,
	}); err != nil {
		t.Fatalf("InsertMotionEvent: %v", err)
	}

	fake := &analysis.FakeAnalyzer{
		Results: []analysis.Detection{
			{Label: "person", Confidence: 0.9, FrameCount: 5},
		},
	}
	cleaner := storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
		WithAnalyzer(fake)
	cleaner.Clean()
	cleaner.AnalyzeNew()

	// pathA has ended_at (pathB appeared), so it should be analyzed
	dets, err := db.ListDetectionsByPath(database, pathA)
	if err != nil {
		t.Fatalf("ListDetectionsByPath: %v", err)
	}
	if len(dets) != 1 || dets[0].Label != "person" {
		t.Errorf("expected 1 detection 'person' for completed chunk, got %v", dets)
	}

	// O label do YOLO deve ser aplicado ao evento sem rótulo da gravação (dado de treino).
	evs, _ := db.ListMotionEvents(database, "cam1", base.Add(-time.Minute), base.Add(2*time.Minute))
	if len(evs) != 1 || evs[0].Label != "person" {
		t.Errorf("expected the recording's event to be labeled 'person', got %v", evs)
	}

	// pathB has no ended_at yet (last in dir) → should not be analyzed
	detsB, _ := db.ListDetectionsByPath(database, pathB)
	if len(detsB) != 0 {
		t.Errorf("incomplete chunk should not be analyzed, got %d detections", len(detsB))
	}

	// Running again should not re-analyze pathA (already has detections)
	prevCalled := fake.Called
	cleaner.Clean()
	cleaner.AnalyzeNew()
	if fake.Called != prevCalled+0 {
		// pathB might get ended_at if a third chunk appears, but none did —
		// just ensure pathA is not re-analyzed
	}
	dets2, _ := db.ListDetectionsByPath(database, pathA)
	if len(dets2) != 1 {
		t.Errorf("re-run should not duplicate detections, got %d", len(dets2))
	}
}

// TestDetectorPorCamera covers CA3 of the "object detector selection per
// camera" story: analysis must be gated per camera by its own chosen
// detector, never by the (post-T3, soon retired) global
// video_analysis_config toggle. The global config is deliberately left at
// its zero value here — disabled, no service_url — to prove the gate no
// longer comes from there.
//
// detector_id/confidence_threshold don't have Go accessors yet (T1
// pending), so the per-camera config is written via raw SQL against the
// columns T1's migration will add. Today those columns don't exist, so this
// INSERT fails at runtime with a clear "no such column" error — not a
// compile error, since no new Go symbol is referenced.
func TestDetectorPorCamera(t *testing.T) {
	t.Run("CA3: análise de gravações usa o detector configurado por câmera, sem depender do serviço global", func(t *testing.T) {
		dir := t.TempDir()
		database := openTestDB(t)
		createTestCameraWithMotion(t, database, "cam1", 10, 10)
		createTestCameraWithMotion(t, database, "cam2", 10, 10)

		detID, err := db.InsertObjectDetector(database, "yolo-principal", map[string]string{
			"service_url": "http://yolo:8000",
			"model":       "yolov8n",
		})
		if err != nil {
			t.Fatalf("InsertObjectDetector: %v", err)
		}

		// cam1: detector chosen and enabled — should be analyzed.
		if _, err := database.Exec(`
			INSERT INTO camera_analysis_config (camera_id, enabled, detector_id, confidence_threshold)
			VALUES ('cam1', 1, ?, 0.5)
			ON CONFLICT(camera_id) DO UPDATE SET
				enabled=1, detector_id=excluded.detector_id, confidence_threshold=excluded.confidence_threshold`,
			detID); err != nil {
			t.Fatalf("configure cam1 detector: %v", err)
		}
		// cam2: no detector chosen (default state) — must stay unanalyzed,
		// even though nothing about the (disabled, empty) global config changed.

		base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
		pathA1 := mp4WithTimestamp(dir, "cam1", base)
		pathA2 := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
		writeFile(t, pathA1, base)
		writeFile(t, pathA2, base.Add(5*time.Minute))

		pathB1 := mp4WithTimestamp(dir, "cam2", base)
		pathB2 := mp4WithTimestamp(dir, "cam2", base.Add(5*time.Minute))
		writeFile(t, pathB1, base)
		writeFile(t, pathB2, base.Add(5*time.Minute))

		for _, cam := range []string{"cam1", "cam2"} {
			if err := db.InsertMotionEvent(database, db.MotionEvent{
				CameraID:   cam,
				OccurredAt: base.Add(time.Minute),
				Score:      0.5,
			}); err != nil {
				t.Fatalf("InsertMotionEvent(%s): %v", cam, err)
			}
		}

		fake := &analysis.FakeAnalyzer{
			Results: []analysis.Detection{{Label: "person", Confidence: 0.9, FrameCount: 3}},
		}
		cleaner := storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
			WithAnalyzer(fake)
		cleaner.Clean()
		cleaner.AnalyzeNew()

		detsA, _ := db.ListDetectionsByPath(database, pathA1)
		if len(detsA) != 1 {
			t.Errorf("cam1 (com detector configurado) deveria ter sido analisada, got %d detections", len(detsA))
		}
		detsB, _ := db.ListDetectionsByPath(database, pathB1)
		if len(detsB) != 0 {
			t.Errorf("cam2 (sem detector escolhido) não deveria ser analisada, got %d detections", len(detsB))
		}
	})
}

func TestAnalyzeNewRecordings_SkipsWhenDisabled(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	// no camera_analysis_config row for cam1 (default state: no detector chosen)
	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(5*time.Minute))

	fake := &analysis.FakeAnalyzer{Results: []analysis.Detection{{Label: "car", Confidence: 0.8}}}
	storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
		WithAnalyzer(fake).
		AnalyzeNew()

	if fake.Called != 0 {
		t.Errorf("analyzer should not be called when no detector is chosen for the camera, called %d times", fake.Called)
	}
}

func TestAnalyzeNewRecordings_SkipsAfterAnalyzeError(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 10, 10)
	configureCameraDetector(t, database, "cam1", "http://yolo:8000", "yolov8n", 0.4)

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(5*time.Minute))

	if err := db.InsertMotionEvent(database, db.MotionEvent{
		CameraID:   "cam1",
		OccurredAt: base.Add(time.Minute),
		Score:      0.5,
	}); err != nil {
		t.Fatalf("InsertMotionEvent: %v", err)
	}

	fake := &analysis.FakeAnalyzer{Err: errors.New("yolo service returned 422")}
	cleaner := storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
		WithAnalyzer(fake)

	cleaner.Clean()
	cleaner.AnalyzeNew()
	if fake.Called != 1 {
		t.Fatalf("expected analyzer called once, got %d", fake.Called)
	}

	// Second run must not retry the failed recording.
	cleaner.Clean()
	cleaner.AnalyzeNew()
	if fake.Called != 1 {
		t.Errorf("failed recording should not be retried, analyzer called %d times total", fake.Called)
	}
}

// T4 — work_progress/stories/202607251518_fine-tuning-yolo-gpu.md.
func TestFineTuningYOLOGPU(t *testing.T) {
	t.Run("CA5: cliente Go trata resposta ocupado do serviço YOLO como retry, não skip permanente", func(t *testing.T) {
		t.Run("não marca analysis_skipped e para a passada quando o serviço YOLO está ocupado", func(t *testing.T) {
			dir := t.TempDir()
			database := openTestDB(t)
			createTestCameraWithMotion(t, database, "cam1", 10, 10)
			configureCameraDetector(t, database, "cam1", "http://yolo:8000", "yolov8n", 0.4)

			base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
			pathA := mp4WithTimestamp(dir, "cam1", base)
			pathB := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
			pathC := mp4WithTimestamp(dir, "cam1", base.Add(10*time.Minute))
			writeFile(t, pathA, base)
			writeFile(t, pathB, base.Add(5*time.Minute))
			writeFile(t, pathC, base.Add(10*time.Minute))

			// Eventos dentro das janelas de A e B, pra ambas virarem candidatas
			// (têm ended_at — C é a última, sem sucessora, fica de fora).
			for _, offset := range []time.Duration{time.Minute, 6 * time.Minute} {
				if err := db.InsertMotionEvent(database, db.MotionEvent{
					CameraID:   "cam1",
					OccurredAt: base.Add(offset),
					Score:      0.5,
				}); err != nil {
					t.Fatalf("InsertMotionEvent: %v", err)
				}
			}

			fake := &analysis.FakeAnalyzer{Err: analysis.ErrServiceBusy}
			cleaner := storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
				WithAnalyzer(fake)

			cleaner.Clean()
			cleaner.AnalyzeNew()
			if fake.Called != 1 {
				t.Fatalf("esperava a passada parar na 1ª gravação ocupada (1 chamada), got %d", fake.Called)
			}
			if dets, _ := db.ListDetectionsByPath(database, pathA); len(dets) != 0 {
				t.Errorf("não deveria haver detecções com o serviço ocupado: %v", dets)
			}

			// Serviço libera — a próxima passada deve reprocessar pathA do
			// zero: nada foi marcado analysis_skipped (permanente) por causa
			// do "ocupado".
			fake.Err = nil
			fake.Results = []analysis.Detection{{Label: "person", Confidence: 0.9}}
			cleaner.Clean()
			cleaner.AnalyzeNew()
			if fake.Called <= 1 {
				t.Fatalf("gravação deveria ter sido reprocessada após o serviço ficar livre, called=%d", fake.Called)
			}
			dets, _ := db.ListDetectionsByPath(database, pathA)
			if len(dets) != 1 || dets[0].Label != "person" {
				t.Errorf("esperava a gravação reprocessada com sucesso, got %v", dets)
			}
		})
	})
}

func TestAnalyzeNewRecordings_SkipsWhenFileNotOnDisk(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 10, 10)
	configureCameraDetector(t, database, "cam1", "http://yolo:8000", "yolov8n", 0.4)

	// Insert a recording that exists in the DB but NOT on disk.
	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	missingPath := mp4WithTimestamp(dir, "cam1", base)
	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: base,
		EndedAt:   base.Add(5 * time.Minute),
		Path:      missingPath,
		SizeBytes: 1024,
		HasMotion: true,
	}); err != nil {
		t.Fatalf("InsertRecording: %v", err)
	}

	fake := &analysis.FakeAnalyzer{Results: []analysis.Detection{{Label: "person", Confidence: 0.9}}}
	storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
		WithAnalyzer(fake).
		AnalyzeNew()

	if fake.Called != 0 {
		t.Errorf("analyzer must not be called when file does not exist on disk, called %d times", fake.Called)
	}
}

// hookAnalyzer wraps analysis.FakeAnalyzer to run a callback right after
// each Analyze call completes — used to simulate the navigator disabling
// analysis for a camera WHILE a batch fetched under the old config is still
// being processed (CA5, história fix/camera-analysis-toggle). Runs AFTER
// FakeAnalyzer.Analyze (not before) so OnAnalyze sees the incremented
// Called count for the call that just finished.
type hookAnalyzer struct {
	analysis.FakeAnalyzer
	OnAnalyze func()
}

func (h *hookAnalyzer) Analyze(ctx context.Context, req analysis.AnalyzeRequest) ([]analysis.Detection, error) {
	dets, err := h.FakeAnalyzer.Analyze(ctx, req)
	if h.OnAnalyze != nil {
		h.OnAnalyze()
	}
	return dets, err
}

// CA5 (história fix/camera-analysis-toggle): analyzeNewRecordings monta a
// lista de candidatos com UMA query no início e itera até o fim — sem isso,
// desabilitar a análise (ou trocar o detector) NO MEIO de um lote grande já
// buscado não tem efeito nenhum até a próxima passada, desperdiçando
// chamadas ao YOLO por algo que o usuário já desligou (confirmado ao vivo no
// dev-camera: um lote de 222 gravações continuou sendo enviado depois da
// análise ser desabilitada). O fix re-checa camera_analysis_config por item
// antes de despachar.
func TestAnalyzeNewRecordings_SkipsWhenConfigChangesMidBatch(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 10, 10)
	configureCameraDetector(t, database, "cam1", "http://yolo:8000", "yolov8n", 0.4)

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(5*time.Minute))

	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: base,
		EndedAt:   base.Add(5 * time.Minute),
		Path:      pathA,
		SizeBytes: 1024,
		HasMotion: true,
	}); err != nil {
		t.Fatalf("InsertRecording pathA: %v", err)
	}
	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: base.Add(5 * time.Minute),
		EndedAt:   base.Add(10 * time.Minute),
		Path:      pathB,
		SizeBytes: 1024,
		HasMotion: true,
	}); err != nil {
		t.Fatalf("InsertRecording pathB: %v", err)
	}

	// Depois de analisar a 1ª gravação (pathA), simula o navigator
	// desabilitando a análise pra essa câmera — a 2ª (pathB), já no
	// candidates buscado antes dessa mudança, deve ser pulada.
	fake := &hookAnalyzer{
		FakeAnalyzer: analysis.FakeAnalyzer{
			Results: []analysis.Detection{{Label: "person", Confidence: 0.9, FrameCount: 5}},
		},
	}
	fake.OnAnalyze = func() {
		if fake.Called == 1 {
			if err := db.SetCameraAnalysisConfig(database, "cam1", db.CameraAnalysisConfig{Enabled: false}); err != nil {
				t.Fatalf("SetCameraAnalysisConfig (disable mid-batch): %v", err)
			}
		}
	}

	storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
		WithAnalyzer(fake).
		AnalyzeNew()

	if fake.Called != 1 {
		t.Fatalf("expected analyzer called once (pathA only, pathB skipped after config change), got %d", fake.Called)
	}
	detsA, _ := db.ListDetectionsByPath(database, pathA)
	if len(detsA) != 1 {
		t.Errorf("pathA should have been analyzed (config was still enabled), got %d detections", len(detsA))
	}
	detsB, _ := db.ListDetectionsByPath(database, pathB)
	if len(detsB) != 0 {
		t.Errorf("pathB should have been skipped (config changed mid-batch), got %d detections", len(detsB))
	}
}

// CA5, ramo irmão do teste acima: a câmera continua HABILITADA, mas o
// detector é trocado no meio do lote — sem re-checar detector_id (só
// enabled), pathB seria analisado com o detector antigo mesmo já não sendo
// mais o escolhido.
func TestAnalyzeNewRecordings_SkipsWhenDetectorSwitchedMidBatch(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 10, 10)
	configureCameraDetector(t, database, "cam1", "http://yolo:8000", "yolov8n", 0.4)

	newDetID, err := db.InsertObjectDetector(database, "cam1-detector-v2", map[string]string{
		"service_url": "http://yolo:9000",
		"model":       "yolo11n",
	})
	if err != nil {
		t.Fatalf("InsertObjectDetector (2º detector): %v", err)
	}

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(5*time.Minute))

	if err := db.InsertRecording(database, db.Recording{
		CameraID: "cam1", StartedAt: base, EndedAt: base.Add(5 * time.Minute),
		Path: pathA, SizeBytes: 1024, HasMotion: true,
	}); err != nil {
		t.Fatalf("InsertRecording pathA: %v", err)
	}
	if err := db.InsertRecording(database, db.Recording{
		CameraID: "cam1", StartedAt: base.Add(5 * time.Minute), EndedAt: base.Add(10 * time.Minute),
		Path: pathB, SizeBytes: 1024, HasMotion: true,
	}); err != nil {
		t.Fatalf("InsertRecording pathB: %v", err)
	}

	// Depois de analisar pathA, simula o navigator trocando de detector pra
	// essa câmera (continua habilitada) — pathB, já no candidates buscado
	// com o detector antigo, deve ser pulado.
	fake := &hookAnalyzer{
		FakeAnalyzer: analysis.FakeAnalyzer{
			Results: []analysis.Detection{{Label: "person", Confidence: 0.9, FrameCount: 5}},
		},
	}
	fake.OnAnalyze = func() {
		if fake.Called == 1 {
			threshold := 0.4
			if err := db.SetCameraAnalysisConfig(database, "cam1", db.CameraAnalysisConfig{
				Enabled: true, DetectorID: &newDetID, ConfidenceThreshold: &threshold,
			}); err != nil {
				t.Fatalf("SetCameraAnalysisConfig (switch detector mid-batch): %v", err)
			}
		}
	}

	storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
		WithAnalyzer(fake).
		AnalyzeNew()

	if fake.Called != 1 {
		t.Fatalf("expected analyzer called once (pathA only, pathB skipped after detector switch), got %d", fake.Called)
	}
	detsA, _ := db.ListDetectionsByPath(database, pathA)
	if len(detsA) != 1 {
		t.Errorf("pathA should have been analyzed (config was still the original detector), got %d detections", len(detsA))
	}
	detsB, _ := db.ListDetectionsByPath(database, pathB)
	if len(detsB) != 0 {
		t.Errorf("pathB should have been skipped (detector switched mid-batch), got %d detections", len(detsB))
	}
}

// Quando ffmpeg é morto abruptamente, o último segmento fica sem moov atom
// (ilegível). syncRecordings deve detectar isso, deletar o arquivo do disco
// e remover o registro do banco.
func TestSyncRecordings_RemovesCorruptRecording(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)

	// pathA: arquivo corrompido (sem moov atom) — simula segmento interrompido
	pathA := mp4WithTimestamp(dir, "cam1", base)
	writeCorruptMP4(t, pathA, base)

	// pathB: arquivo válido — segmento criado pelo ffmpeg após reconexão
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(30*time.Second))
	writeFile(t, pathB, base.Add(30*time.Second))

	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	// pathA deve ter sido deletado do disco
	if _, err := os.Stat(pathA); !os.IsNotExist(err) {
		t.Error("corrupt pathA should have been deleted from disk")
	}

	// pathA não deve estar no banco
	ids, err := db.IDsByPaths(database, []string{pathA, pathB})
	if err != nil {
		t.Fatalf("IDsByPaths: %v", err)
	}
	if ids[pathA] != 0 {
		t.Error("corrupt pathA should not be in database")
	}

	// pathB ainda deve existir (arquivo válido, mas sem sucessor → ended_at NULL)
	if _, err := os.Stat(pathB); err != nil {
		t.Errorf("valid pathB should still exist on disk: %v", err)
	}
}

// Arquivo corrompido já inserido no banco (de antes do fix) também é limpo.
func TestSyncRecordings_RemovesCorruptRecordingAlreadyInDB(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(30*time.Second))

	// Pré-insere pathA no banco com ended_at definido (estado pré-fix)
	writeCorruptMP4(t, pathA, base)
	if err := db.InsertRecording(database, db.Recording{
		CameraID:  "cam1",
		StartedAt: base,
		EndedAt:   base.Add(30 * time.Second),
		Path:      pathA,
		SizeBytes: 31,
	}); err != nil {
		t.Fatalf("InsertRecording: %v", err)
	}

	writeFile(t, pathB, base.Add(30*time.Second))

	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	// pathA deve ter sido removido do disco e do banco
	if _, err := os.Stat(pathA); !os.IsNotExist(err) {
		t.Error("pre-existing corrupt pathA should have been deleted from disk")
	}
	ids, err := db.IDsByPaths(database, []string{pathA, pathB})
	if err != nil {
		t.Fatalf("IDsByPaths: %v", err)
	}
	if ids[pathA] != 0 {
		t.Error("pre-existing corrupt pathA should have been removed from database")
	}
}

// TestSyncRecordings_CorruptChunkPurgesMotionAssets verifica que descartar um
// chunk corrompido (moov atom ausente) também purga o motion_event e o
// _motion.jpg cuja janela caía dentro daquele chunk — sem isso o evento fica
// órfão pra sempre, já que nada mais volta a revisitar aquele arquivo depois
// que a linha de motion_events some do banco.
func TestSyncRecordings_CorruptChunkPurgesMotionAssets(t *testing.T) {
	t.Run("CA2: chunk corrompido (moov ausente) purga motion_event e o _motion.jpg associado", func(t *testing.T) {
		dir := t.TempDir()
		database := openTestDB(t)
		createTestCamera(t, database, "cam1")

		base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)

		// pathA: corrompido (sem moov atom), tem sucessor conhecido (pathB) —
		// syncRecordings descarta pathA como corrupto.
		pathA := mp4WithTimestamp(dir, "cam1", base)
		writeCorruptMP4(t, pathA, base)

		pathB := mp4WithTimestamp(dir, "cam1", base.Add(30*time.Second))
		writeFile(t, pathB, base.Add(30*time.Second))

		// evento de movimento com frame_path dentro da janela de pathA.
		evTime := base.Add(10 * time.Second)
		jpegName := evTime.UTC().Format("20060102150405") + "_motion.jpg"
		jpegPath := filepath.Join(filepath.Dir(pathA), jpegName)
		writeFile(t, jpegPath, evTime)

		if _, err := database.Exec(
			`INSERT INTO motion_events(camera_id, occurred_at, score, frame_path) VALUES(?,?,?,?)`,
			"cam1", evTime.UTC().Format(time.RFC3339), 0.1, jpegName,
		); err != nil {
			t.Fatalf("insert motion event: %v", err)
		}

		storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

		if _, err := os.Stat(pathA); !os.IsNotExist(err) {
			t.Error("corrupt pathA should have been deleted from disk")
		}
		if _, err := os.Stat(jpegPath); !os.IsNotExist(err) {
			t.Error("_motion.jpg do evento dentro do chunk corrompido deveria ter sido purgado junto")
		}
		var count int
		database.QueryRow(`SELECT COUNT(*) FROM motion_events WHERE camera_id='cam1'`).Scan(&count)
		if count != 0 {
			t.Errorf("motion_events deveria estar vazio após purge do chunk corrompido, mas tem %d linhas", count)
		}
	})
}

func TestAnalyzeNewRecordings_DisabledDoesNotLog(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	writeFile(t, mp4WithTimestamp(dir, "cam1", base), base)

	var buf bytes.Buffer
	log := slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))

	fake := &analysis.FakeAnalyzer{}
	storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, log).
		WithAnalyzer(fake).
		AnalyzeNew()

	if strings.Contains(buf.String(), "skipped (disabled)") {
		t.Error("AnalyzeNew() should not log 'skipped (disabled)' when analysis is globally disabled")
	}
}

// O cleaner deve purgar motion_events órfãos (sem gravação cobrindo o
// occurred_at) mais velhos que a retenção, apagando também o JPEG do frame.
func TestClean_PurgesOldOrphanMotionEvents(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	old := time.Now().UTC().Add(-10 * 24 * time.Hour) // bem além de 7 dias
	day := old.Format("2006/01/02")
	frame := old.Format("20060102150405") + "_motion.jpg"
	jpegPath := filepath.Join(dir, "cam1", filepath.FromSlash(day), frame)
	writeFile(t, jpegPath, old)

	if err := db.InsertMotionEvent(database, db.MotionEvent{
		CameraID:   "cam1",
		OccurredAt: old,
		FramePath:  frame,
	}); err != nil {
		t.Fatalf("InsertMotionEvent: %v", err)
	}

	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	n, err := db.CountMotionEvents(database, "cam1")
	if err != nil {
		t.Fatalf("CountMotionEvents: %v", err)
	}
	if n != 0 {
		t.Errorf("expected orphan event purged, got %d remaining", n)
	}
	if _, err := os.Stat(jpegPath); !os.IsNotExist(err) {
		t.Errorf("expected orphan jpeg removed, stat err = %v", err)
	}
}

// Eventos órfãos dentro da retenção NÃO podem ser apagados.
func TestClean_KeepsRecentOrphanMotionEvents(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	recent := time.Now().UTC().Add(-1 * time.Hour)
	if err := db.InsertMotionEvent(database, db.MotionEvent{CameraID: "cam1", OccurredAt: recent}); err != nil {
		t.Fatalf("InsertMotionEvent: %v", err)
	}

	storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	n, err := db.CountMotionEvents(database, "cam1")
	if err != nil {
		t.Fatalf("CountMotionEvents: %v", err)
	}
	if n != 1 {
		t.Errorf("expected recent orphan kept, got %d", n)
	}
}

// TestClean_SweepsOrphanedMotionJPEGsOlderThanRetention: rede de segurança em
// disco, independente do banco — um diretório {camera}/{ano}/{mes}/{dia} sem
// nenhum .mp4 (já removido por qualquer caminho, inclusive um bug futuro que
// escape de purgeMotionAssets/purgeOrphanEvents) mas mais velho que a
// retenção com-movimento tem os _motion.jpg residuais removidos.
func TestClean_SweepsOrphanedMotionJPEGsOlderThanRetention(t *testing.T) {
	t.Run("CA3: diretório sem .mp4 mais velho que a retenção com-movimento tem os _motion.jpg residuais removidos", func(t *testing.T) {
		dir := t.TempDir()
		database := openTestDB(t)
		createTestCamera(t, database, "cam1")

		old := time.Now().UTC().Add(-10 * 24 * time.Hour)
		dayDir := filepath.Join(dir, "cam1", old.Format("2006/01/02"))
		jpegPath := filepath.Join(dayDir, old.Format("20060102150405")+"_motion.jpg")
		writeFile(t, jpegPath, old)

		// with_motion_minutes = 3 dias (4320); "old" tem 10 dias — bem além da
		// janela, e o diretório não tem nenhum .mp4 (nem linha no banco).
		storage.New(dir, 4320, 1440, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

		if _, err := os.Stat(jpegPath); !os.IsNotExist(err) {
			t.Error("jpg órfão mais velho que a retenção com-movimento deveria ter sido removido pela varredura")
		}
	})
}

// Depois de remover o último jpg órfão de um diretório, o diretório do DIA em
// si (agora vazio) também é removido — sem isso o filesystem acumula uma
// árvore de diretórios vazios pra sempre, mesmo com o conteúdo já limpo
// (reportado pelo navigator: "tem diretórios até do mês passado... vazios").
func TestClean_RemovesEmptyDayDirAfterSweep(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	old := time.Now().UTC().Add(-10 * 24 * time.Hour)
	dayDir := filepath.Join(dir, "cam1", old.Format("2006/01/02"))
	jpegPath := filepath.Join(dayDir, old.Format("20060102150405")+"_motion.jpg")
	writeFile(t, jpegPath, old)

	storage.New(dir, 4320, 1440, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(dayDir); !os.IsNotExist(err) {
		t.Error("diretório do dia deveria ter sido removido depois de esvaziado pela varredura")
	}
}

// A remoção do diretório do dia é conservadora: só some se a varredura
// esvaziou o diretório (nenhum .mp4, jpg mais velho que a retenção). Um
// diretório que ainda tem .mp4 nunca é removido, mesmo mais velho que a
// retenção — mesma regra de nunca tocar num diretório com chunk.
func TestClean_KeepsDayDirWithMP4Present(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	old := time.Now().UTC().Add(-10 * 24 * time.Hour)
	dayDir := filepath.Join(dir, "cam1", old.Format("2006/01/02"))
	mp4Path := filepath.Join(dayDir, old.Format("20060102150405")+".mp4")
	writeFile(t, mp4Path, old)

	storage.New(dir, 4320, 1440, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(dayDir); err != nil {
		t.Errorf("diretório do dia com .mp4 presente não deveria ter sido removido: %v", err)
	}
}

// Se TODOS os dias de um mês esvaziam (e o diretório do dia some), o
// diretório do MÊS também é removido quando fica vazio — e o mesmo em
// cascata pro diretório do ANO, se todos os meses também esvaziarem.
func TestClean_RemovesEmptyMonthAndYearDirsWhenAllDaysCleared(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	old := time.Now().UTC().Add(-10 * 24 * time.Hour)
	dayDir := filepath.Join(dir, "cam1", old.Format("2006/01/02"))
	jpegPath := filepath.Join(dayDir, old.Format("20060102150405")+"_motion.jpg")
	writeFile(t, jpegPath, old)

	monthDir := filepath.Join(dir, "cam1", old.Format("2006/01"))
	yearDir := filepath.Join(dir, "cam1", old.Format("2006"))

	storage.New(dir, 4320, 1440, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(monthDir); !os.IsNotExist(err) {
		t.Error("diretório do mês deveria ter sido removido — único dia dentro dele já esvaziou")
	}
	if _, err := os.Stat(yearDir); !os.IsNotExist(err) {
		t.Error("diretório do ano deveria ter sido removido — único mês dentro dele já esvaziou")
	}
}

// Mês com outro dia ainda ativo (dentro da retenção) não é removido, mesmo
// que o dia antigo dentro dele já tenha esvaziado e sumido.
func TestClean_KeepsMonthDirWithAnotherActiveDay(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	old := time.Now().UTC().Add(-10 * 24 * time.Hour)
	oldDayDir := filepath.Join(dir, "cam1", old.Format("2006/01/02"))
	oldJpegPath := filepath.Join(oldDayDir, old.Format("20060102150405")+"_motion.jpg")
	writeFile(t, oldJpegPath, old)

	recent := time.Now().UTC().Add(-1 * time.Hour)
	recentDayDir := filepath.Join(dir, "cam1", recent.Format("2006/01/02"))
	recentMP4Path := filepath.Join(recentDayDir, recent.Format("20060102150405")+".mp4")
	writeFile(t, recentMP4Path, recent)

	monthDir := filepath.Join(dir, "cam1", old.Format("2006/01"))

	storage.New(dir, 4320, 1440, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(oldDayDir); !os.IsNotExist(err) {
		t.Error("diretório do dia antigo deveria ter sido removido")
	}
	// Só verifica a preservação do mês se old e recent caírem no mesmo mês
	// (podem não cair, dependendo de quando o teste roda perto da virada).
	if old.Format("2006/01") == recent.Format("2006/01") {
		if _, err := os.Stat(monthDir); err != nil {
			t.Errorf("diretório do mês não deveria ter sido removido — ainda tem o dia recente: %v", err)
		}
	}
}

// A varredura também remove _frame.jpg órfão (companion do _motion.jpg,
// internal/motion/detector.go) — mesmo diretório-sem-mp4 pode ter só o
// _frame.jpg sobrando (achado real: seu _motion.jpg já foi purgado por outro
// caminho, mas nada nunca soube limpar o companion, já que ele não tem
// nenhuma linha própria no banco).
func TestClean_SweepsOrphanedCleanFrameJPEGsOlderThanRetention(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	old := time.Now().UTC().Add(-10 * 24 * time.Hour)
	dayDir := filepath.Join(dir, "cam1", old.Format("2006/01/02"))
	framePath := filepath.Join(dayDir, old.Format("20060102150405")+"_frame.jpg")
	writeFile(t, framePath, old)

	storage.New(dir, 4320, 1440, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(framePath); !os.IsNotExist(err) {
		t.Error("_frame.jpg órfão mais velho que a retenção com-movimento deveria ter sido removido pela varredura")
	}
}

// Diretório mais recente que a retenção não é tocado, mesmo sem .mp4 —
// evita apagar um snapshot que ainda deveria estar disponível.
func TestClean_KeepsOrphanedMotionJPEGsWithinRetention(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	recent := time.Now().UTC().Add(-1 * time.Hour)
	dayDir := filepath.Join(dir, "cam1", recent.Format("2006/01/02"))
	jpegPath := filepath.Join(dayDir, recent.Format("20060102150405")+"_motion.jpg")
	writeFile(t, jpegPath, recent)

	storage.New(dir, 4320, 1440, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(jpegPath); err != nil {
		t.Errorf("jpg dentro da retenção não deveria ter sido removido: %v", err)
	}
}

// Diretório que ainda tem .mp4 nunca é tocado pela varredura, mesmo mais
// velho que a retenção — evita colidir com um chunk ainda em uso/pendente
// de processamento pelos outros caminhos de limpeza.
func TestClean_DoesNotSweepDirWithMP4Present(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	old := time.Now().UTC().Add(-10 * 24 * time.Hour)
	dayDir := filepath.Join(dir, "cam1", old.Format("2006/01/02"))
	jpegPath := filepath.Join(dayDir, old.Format("20060102150405")+"_motion.jpg")
	mp4Path := filepath.Join(dayDir, old.Format("20060102150405")+".mp4")
	writeFile(t, jpegPath, old)
	writeFile(t, mp4Path, old)

	storage.New(dir, 4320, 1440, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

	if _, err := os.Stat(jpegPath); err != nil {
		t.Errorf("jpg num diretório com .mp4 presente não deveria ter sido removido: %v", err)
	}
}

// TestClean_SweepOrphanedMotionDirsUsesLiveDBOverride: o admin pode mudar
// with_motion_minutes via UI depois que o processo já subiu — cleanFromDB()
// já lê o valor ao vivo do banco (effectiveRetentionMinutes), mas a varredura
// de diretórios órfãos não pode ficar presa ao valor de construção do
// Cleaner (lido só uma vez no boot em main.go), senão uma mudança de retenção
// em runtime nunca é respeitada por ela até o processo reiniciar — bug real
// reportado pelo navigator (configurou 2 dias, diretórios de mais de 2 dias
// continuavam intactos).
func TestClean_SweepOrphanedMotionDirsUsesLiveDBOverride(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCamera(t, database, "cam1")

	// Cleaner construído com with_motion_minutes GRANDE (7 dias) — simula o
	// valor lido no boot do processo.
	c := storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger())

	// Admin muda a retenção via UI DEPOIS do boot — só grava em system_config,
	// não reconstrói o Cleaner.
	if err := db.SetConfig(database, "storage.with_motion_minutes", "1440"); err != nil {
		t.Fatalf("SetConfig: %v", err)
	}

	// 3 dias de idade: viola o override do banco (1 dia), mas NÃO violaria o
	// valor de construção (7 dias) — só passa se a varredura usar o override.
	// A varredura opera em granularidade de dia (dayEnd = fim do dia daquele
	// diretório), então o teste precisa cruzar um dia inteiro, não só horas.
	old := time.Now().UTC().Add(-3 * 24 * time.Hour)
	dayDir := filepath.Join(dir, "cam1", old.Format("2006/01/02"))
	jpegPath := filepath.Join(dayDir, old.Format("20060102150405")+"_motion.jpg")
	writeFile(t, jpegPath, old)

	c.Clean()

	if _, err := os.Stat(jpegPath); !os.IsNotExist(err) {
		t.Error("varredura deveria ter usado o override do banco (1 dia), não o valor de construção (7 dias) — jpg deveria ter sido removido")
	}
}

// Ao cruzar o limite de Alerta(%), cada admin recebe uma notificação; viewers não.
// Edge-triggered: não duplica enquanto continua acima.
func TestCheckSize_NotifiesAdminsOnThresholdCrossing(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	admin, err := db.CreateUser(database, "admin", "pw", "admin", false)
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	viewer, err := db.CreateUser(database, "viewer", "pw", "viewer", false)
	if err != nil {
		t.Fatalf("create viewer: %v", err)
	}

	// maxSizeGB ~107 bytes, 70% ~74 bytes; 200-byte file is above the warn threshold.
	writeFileWithSize(t, filepath.Join(dir, "cam1", "big.mp4"), 200)

	c := storage.New(dir, 0, 0, 5*time.Minute, 1e-7, 70, database, discardLogger()).
		WithNotifications(notifications.NewDispatcher(discardLogger(), application.New(database, nil)))
	c.CheckSize()

	if n, _ := db.CountUnreadNotifications(database, admin); n != 1 {
		t.Errorf("admin should have 1 notification, got %d", n)
	}
	if n, _ := db.CountUnreadNotifications(database, viewer); n != 0 {
		t.Errorf("viewer should have 0 notifications, got %d", n)
	}

	// Still above on the next check → no duplicate (edge-triggered).
	c.CheckSize()
	if n, _ := db.CountUnreadNotifications(database, admin); n != 1 {
		t.Errorf("admin should still have 1 notification (no duplicate), got %d", n)
	}
}

// blockingAnalyzer hangs inside Analyze until release is closed, simulating a slow
// YOLO backlog. Used to prove the retention pass is not blocked by analysis.
type blockingAnalyzer struct {
	release chan struct{}
	once    sync.Once
	started chan struct{}
}

func (b *blockingAnalyzer) Analyze(ctx context.Context, _ analysis.AnalyzeRequest) ([]analysis.Detection, error) {
	b.once.Do(func() { close(b.started) })
	select {
	case <-b.release:
	case <-ctx.Done():
	}
	return nil, ctx.Err()
}

// Retention must run even when analysis is backed up. The bug: Clean() called
// analyzeNewRecordings synchronously before cleanFromDB, so a slow analysis
// (2 min timeout × a large backlog) starved retention for hours and overdue
// recordings piled up far beyond their configured retention.
func TestClean_RetentionNotBlockedByAnalysis(t *testing.T) {
	dir := t.TempDir()
	database := openTestDB(t)
	createTestCameraWithMotion(t, database, "cam1", 10, 10)
	configureCameraDetector(t, database, "cam1", "http://yolo:8000", "yolov8n", 0.4)

	base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
	pathA := mp4WithTimestamp(dir, "cam1", base)
	pathB := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
	writeFile(t, pathA, base)
	writeFile(t, pathB, base.Add(5*time.Minute))

	// Motion event so pathA is has_motion=1 — both a retention candidate and an
	// analysis candidate.
	if err := db.InsertMotionEvent(database, db.MotionEvent{
		CameraID:   "cam1",
		OccurredAt: base.Add(time.Minute),
		Score:      0.5,
	}); err != nil {
		t.Fatalf("InsertMotionEvent: %v", err)
	}

	blocker := &blockingAnalyzer{release: make(chan struct{}), started: make(chan struct{})}
	// Retention of 1 minute → pathA (2h old, has_motion, action=delete) is overdue.
	cleaner := storage.New(dir, 1, 1, 5*time.Minute, 0, 0, database, discardLogger()).
		WithAnalyzer(blocker)

	done := make(chan struct{})
	go func() { cleaner.Clean(); close(done) }()

	// pathA must be expired by cleanFromDB even while analysis is blocked.
	deadline := time.After(2 * time.Second)
	for {
		if _, err := os.Stat(pathA); os.IsNotExist(err) {
			break // retention ran — good
		}
		select {
		case <-deadline:
			close(blocker.release)
			<-done
			t.Fatal("retention did not run while analysis was pending — analysis is blocking the clean loop")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}
	close(blocker.release)
	<-done
}

// fakeDetector implements detector.Detector for TestDetectorAdapterPattern
// below — avoids ever hitting the real Hugging Face Inference API from a
// test (internal/detector/adapters.HuggingFace hardcodes that host, with no
// config-driven override).
type fakeDetector struct {
	results      []analysis.Detection
	err          error
	called       int
	gotPath      string
	gotThreshold float64
}

func (f *fakeDetector) Detect(_ context.Context, path string, threshold float64) ([]analysis.Detection, error) {
	f.called++
	f.gotPath = path
	f.gotThreshold = threshold
	return f.results, f.err
}

// TestDetectorAdapterPattern covers the story feat(analysis): object
// detector adapter pattern (yolo/hugging face) — CA6: analyzeNewRecordings
// resolves a huggingface-type detector via internal/detector (not the
// yolo-only analysis.Analyzer/WithAnalyzer path every other test here uses).
func TestDetectorAdapterPattern(t *testing.T) {
	t.Run("CA6: análise automática por câmera despacha um detector huggingface via internal/detector", func(t *testing.T) {
		dir := t.TempDir()
		database := openTestDB(t)
		createTestCameraWithMotion(t, database, "cam1", 10, 10)

		detID, err := db.InsertObjectDetector(database, "hf-detector", map[string]string{
			"model_id":  "facebook/detr-resnet-50",
			"api_token": "hf_secret",
		})
		if err != nil {
			t.Fatalf("InsertObjectDetector: %v", err)
		}
		if err := db.SetObjectDetectorType(database, detID, "huggingface"); err != nil {
			t.Fatalf("SetObjectDetectorType: %v", err)
		}
		threshold := 0.6
		if err := db.SetCameraAnalysisConfig(database, "cam1", db.CameraAnalysisConfig{
			Enabled:             true,
			DetectorID:          &detID,
			ConfidenceThreshold: &threshold,
		}); err != nil {
			t.Fatalf("SetCameraAnalysisConfig: %v", err)
		}

		base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
		pathA1 := mp4WithTimestamp(dir, "cam1", base)
		pathA2 := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
		writeFile(t, pathA1, base)
		writeFile(t, pathA2, base.Add(5*time.Minute))
		if err := db.InsertMotionEvent(database, db.MotionEvent{
			CameraID:   "cam1",
			OccurredAt: base.Add(time.Minute),
			Score:      0.5,
		}); err != nil {
			t.Fatalf("InsertMotionEvent: %v", err)
		}

		fake := &fakeDetector{results: []analysis.Detection{{Label: "person", Confidence: 0.95, FrameCount: 1}}}
		cleaner := storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
			WithDetectorFactory(func(detectorType string, config map[string]string) (detector.Detector, error) {
				if detectorType != "huggingface" {
					t.Fatalf("expected huggingface dispatch, got type %q", detectorType)
				}
				if config["model_id"] != "facebook/detr-resnet-50" || config["api_token"] != "hf_secret" {
					t.Fatalf("unexpected config passed to factory: %+v", config)
				}
				return fake, nil
			})
		cleaner.Clean()
		cleaner.AnalyzeNew()

		if fake.called != 1 {
			t.Fatalf("expected the huggingface detector to be invoked once, got %d", fake.called)
		}
		if fake.gotThreshold != 0.6 {
			t.Fatalf("expected the camera's own confidence_threshold (0.6) to be forwarded, got %v", fake.gotThreshold)
		}
		dets, _ := db.ListDetectionsByPath(database, pathA1)
		if len(dets) != 1 || dets[0].Label != "person" {
			t.Fatalf("expected 1 detection labeled person persisted, got %+v", dets)
		}
	})

	t.Run("CA11: análise huggingface usa o snapshot do evento de movimento (mesma imagem da tela Testar), não um frame às cegas do vídeo", func(t *testing.T) {
		dir := t.TempDir()
		database := openTestDB(t)
		createTestCameraWithMotion(t, database, "cam1", 10, 10)

		detID, err := db.InsertObjectDetector(database, "hf-detector", map[string]string{
			"model_id":  "facebook/detr-resnet-50",
			"api_token": "hf_secret",
		})
		if err != nil {
			t.Fatalf("InsertObjectDetector: %v", err)
		}
		if err := db.SetObjectDetectorType(database, detID, "huggingface"); err != nil {
			t.Fatalf("SetObjectDetectorType: %v", err)
		}
		threshold := 0.6
		if err := db.SetCameraAnalysisConfig(database, "cam1", db.CameraAnalysisConfig{
			Enabled:             true,
			DetectorID:          &detID,
			ConfidenceThreshold: &threshold,
		}); err != nil {
			t.Fatalf("SetCameraAnalysisConfig: %v", err)
		}

		base := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Second)
		pathA1 := mp4WithTimestamp(dir, "cam1", base)
		pathA2 := mp4WithTimestamp(dir, "cam1", base.Add(5*time.Minute))
		writeFile(t, pathA1, base)
		writeFile(t, pathA2, base.Add(5*time.Minute))

		// frame_path no banco é só o NOME do arquivo (internal/motion salva
		// assim) — o caminho real em disco se reconstrói via
		// câmera/dia/nome, mesma convenção de RemoveMotionEventJPEGs
		// (cleaner.go) e do teste TestClean_PurgesOldOrphanMotionEvents já
		// existente neste arquivo. Testar com um path absoluto cru aqui
		// mascararia justamente esse bug.
		eventTime := base.Add(time.Minute)
		frameName := eventTime.Format("20060102150405") + "_motion.jpg"
		dayDir := eventTime.Format("2006/01/02")
		framePath := filepath.Join(dir, "cam1", filepath.FromSlash(dayDir), frameName)
		writeFile(t, framePath, eventTime)

		// A weaker event with no frame_path (e.g. purged) must be ignored in
		// favor of the strongest one that actually has a snapshot on disk.
		if err := db.InsertMotionEvent(database, db.MotionEvent{
			CameraID:   "cam1",
			OccurredAt: base.Add(30 * time.Second),
			Score:      0.9,
		}); err != nil {
			t.Fatalf("InsertMotionEvent (no frame_path): %v", err)
		}
		if err := db.InsertMotionEvent(database, db.MotionEvent{
			CameraID:   "cam1",
			OccurredAt: eventTime,
			Score:      0.5,
			FramePath:  frameName,
		}); err != nil {
			t.Fatalf("InsertMotionEvent (with frame_path): %v", err)
		}

		fake := &fakeDetector{results: []analysis.Detection{{Label: "person", Confidence: 0.95, FrameCount: 1}}}
		cleaner := storage.New(dir, 0, 0, 5*time.Minute, 0, 0, database, discardLogger()).
			WithDetectorFactory(func(string, map[string]string) (detector.Detector, error) {
				return fake, nil
			})
		cleaner.Clean()
		cleaner.AnalyzeNew()

		if fake.gotPath != framePath {
			t.Fatalf("expected the motion event snapshot (%q) to be sent, got %q", framePath, fake.gotPath)
		}
	})
}

// TestClean_NoLongerTouchesStateClassification cobre a história
// chore/remover-classificacao-estados-backend — Clean() para de varrer
// state_history/state_samples órfãos e de purgar camera_state_history. Usa SQL bruto
// (sem db.CreateStateClassifier/stateclass) pra sobreviver ao ticket que deleta esse
// pacote — só deixa de fazer sentido quando a migration de DROP das tabelas rodar
// (último ticket da história).
func TestClean_NoLongerTouchesStateClassification(t *testing.T) {
	t.Run("CA5: Clean() não varre mais diretórios de estado nem purga histórico (classificação de estado removida)", func(t *testing.T) {
		dir := t.TempDir()
		database := openTestDB(t)
		createTestCamera(t, database, "cam1")

		res, err := database.Exec(
			`INSERT INTO camera_state_classifiers (camera_id, name, crop_x, crop_y, crop_w, crop_h) VALUES (?, ?, ?, ?, ?, ?)`,
			"cam1", "Portão", 0.1, 0.1, 0.3, 0.3,
		)
		if err != nil {
			t.Fatalf("insert classifier: %v", err)
		}
		cid, _ := res.LastInsertId()

		old := time.Now().UTC().Add(-365 * 24 * time.Hour).Format("2006-01-02 15:04:05")
		if _, err := database.Exec(
			`INSERT INTO camera_state_history (classifier_id, state, confidence, frame_path, changed_at) VALUES (?, ?, ?, ?, ?)`,
			cid, "aberto", 0.9, "/recordings/state_history/1/old.jpg", old,
		); err != nil {
			t.Fatalf("insert transition: %v", err)
		}

		orphanHistory := filepath.Join(dir, "state_history", "999", "1.jpg")
		writeFile(t, orphanHistory, time.Now())

		storage.New(dir, 10080, 10080, 5*time.Minute, 0, 0, database, discardLogger()).Clean()

		if _, err := os.Stat(orphanHistory); err != nil {
			t.Errorf("diretório órfão de estado não deveria mais ser varrido (sweep removido): %v", err)
		}
		var count int
		if err := database.QueryRow(`SELECT COUNT(*) FROM camera_state_history WHERE classifier_id = ?`, cid).Scan(&count); err != nil {
			t.Fatalf("count: %v", err)
		}
		if count != 1 {
			t.Errorf("transição de estado antiga não deveria mais ser purgada (purge removido), count=%d", count)
		}
	})
}
