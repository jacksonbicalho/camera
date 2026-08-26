package recorder_test

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"camera/internal/config"
	"camera/internal/events"
	"camera/internal/exec"
	"camera/internal/ffprobe"
	"camera/internal/recorder"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

type fakeProcess struct{}

func (p *fakeProcess) Terminate() error { return nil }
func (p *fakeProcess) Wait() error      { return nil }

type trackingProcess struct {
	terminated bool
	waited     bool
}

func (p *trackingProcess) Terminate() error { p.terminated = true; return nil }
func (p *trackingProcess) Wait() error      { p.waited = true; return nil }

type blockingProcess struct {
	done sync.Once
	ch   chan struct{}
}

func newBlockingProcess() *blockingProcess { return &blockingProcess{ch: make(chan struct{})} }
func (p *blockingProcess) Terminate() error {
	p.done.Do(func() { close(p.ch) })
	return nil
}
func (p *blockingProcess) Wait() error { <-p.ch; return nil }

type fakeCommander struct {
	calls   [][]string
	process exec.Process
}

func (f *fakeCommander) Start(name string, args ...string) (exec.Process, error) {
	f.calls = append(f.calls, append([]string{name}, args...))
	if f.process != nil {
		return f.process, nil
	}
	return &fakeProcess{}, nil
}

type countingCommander struct {
	mu        sync.Mutex
	count     int
	threshold int
	reached   chan struct{}
	onStart   func(n int) exec.Process
}

func newCountingCommander(threshold int, onStart func(n int) exec.Process) *countingCommander {
	return &countingCommander{threshold: threshold, reached: make(chan struct{}), onStart: onStart}
}

func (c *countingCommander) Start(name string, args ...string) (exec.Process, error) {
	c.mu.Lock()
	c.count++
	n := c.count
	if n >= c.threshold {
		select {
		case <-c.reached:
		default:
			close(c.reached)
		}
	}
	c.mu.Unlock()
	return c.onStart(n), nil
}

func containsSequence(haystack []string, key, value string) bool {
	for i := 0; i < len(haystack)-1; i++ {
		if haystack[i] == key && haystack[i+1] == value {
			return true
		}
	}
	return false
}

func containsArg(haystack []string, s string) bool {
	for _, a := range haystack {
		if a == s {
			return true
		}
	}
	return false
}

func TestOutputPatternBuildsFilename(t *testing.T) {
	ts := time.Date(2026, 4, 30, 23, 0, 0, 0, time.UTC)

	got := recorder.OutputPattern("/data", "entrada", ts)

	want := "/data/entrada/2026/04/30/%Y%m%d%H%M%S.mp4"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestOutputDirUsesUTCTime(t *testing.T) {
	ts := time.Date(2026, 4, 30, 23, 0, 0, 0, time.UTC)

	got := recorder.OutputDir("/data", "entrada", ts)

	want := "/data/entrada/2026/04/30"
	if got != want {
		t.Errorf("expected %q, got %q", want, got)
	}
}

func TestRecorderCreatesDirectoryBeforeStarting(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 23, 0, 0, 0, time.UTC)

	camera := config.CameraConfig{ID: "entrada", RTSPURL: "rtsp://192.168.1.10:554/stream"}
	storage := config.StorageConfig{Path: tmpDir}

	rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, &fakeCommander{}, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantDir := filepath.Join(tmpDir, "entrada", "2026", "04", "30")
	if _, err := os.Stat(wantDir); os.IsNotExist(err) {
		t.Errorf("expected directory %q to exist", wantDir)
	}
}

func TestRecorderStartsFFmpegWithCorrectArguments(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)

	camera := config.CameraConfig{
		ID:            "entrada",
		RTSPURL:       "rtsp://192.168.1.10:554/stream",
		ChunkDuration: config.Duration(5 * time.Minute),
	}
	storage := config.StorageConfig{Path: tmpDir}

	cmd := &fakeCommander{}
	rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, cmd, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(cmd.calls) != 1 {
		t.Fatalf("expected 1 command call, got %d", len(cmd.calls))
	}
	args := cmd.calls[0]
	if args[0] != "ffmpeg" {
		t.Errorf("expected command %q, got %q", "ffmpeg", args[0])
	}
	if !containsSequence(args, "-i", "rtsp://192.168.1.10:554/stream") {
		t.Error("expected -i <rtsp_url> in args")
	}
	if !containsSequence(args, "-c", "copy") {
		t.Error("expected -c copy in args")
	}
	if !containsSequence(args, "-segment_time", "300") {
		t.Error("expected -segment_time 300 in args")
	}
	if !containsSequence(args, "-avoid_negative_ts", "make_zero") {
		t.Error("expected -avoid_negative_ts make_zero in args")
	}
	if containsArg(args, "-segment_format_options") {
		t.Error("recorder must not use -segment_format_options (fragmented MP4 delays the moov atom, breaking duration/playback until the chunk closes)")
	}
	if !containsSequence(args, "-strftime", "1") {
		t.Error("expected -strftime 1 in args")
	}
	wantPattern := filepath.Join(tmpDir, "entrada", "2026", "04", "30") + "/%Y%m%d%H%M%S.mp4"
	if args[len(args)-1] != wantPattern {
		t.Errorf("expected output pattern %q, got %q", wantPattern, args[len(args)-1])
	}
}

func TestRecorderStopFinalizesChunk(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)

	camera := config.CameraConfig{ID: "entrada", RTSPURL: "rtsp://192.168.1.10:554/stream"}
	storage := config.StorageConfig{Path: tmpDir}

	proc := &trackingProcess{}
	cmd := &fakeCommander{process: proc}

	rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, cmd, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	rec.Stop()

	if !proc.terminated {
		t.Error("expected Terminate() to be called")
	}
	if !proc.waited {
		t.Error("expected Wait() to be called after Terminate()")
	}
}

func TestRecorderAddsAnFlagWhenNoAudio(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)

	camera := config.CameraConfig{ID: "cam1", RTSPURL: "rtsp://192.168.1.10:554/stream"}
	storage := config.StorageConfig{Path: tmpDir}
	stream := ffprobe.StreamInfo{HasAudio: false}

	cmd := &fakeCommander{}
	rec := recorder.NewRecorder(camera, storage, stream, cmd, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !containsArg(cmd.calls[0], "-an") {
		t.Error("expected -an in ffmpeg args when HasAudio = false")
	}
}

func TestRecorderDoesNotAddAnFlagWhenHasAudio(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)

	camera := config.CameraConfig{ID: "cam1", RTSPURL: "rtsp://192.168.1.10:554/stream"}
	storage := config.StorageConfig{Path: tmpDir}
	stream := ffprobe.StreamInfo{HasAudio: true}

	cmd := &fakeCommander{}
	rec := recorder.NewRecorder(camera, storage, stream, cmd, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if containsArg(cmd.calls[0], "-an") {
		t.Error("expected no -an in ffmpeg args when HasAudio = true")
	}
}

func TestRecorderTranscodesWhenModeIsH264(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)

	camera := config.CameraConfig{
		ID:              "cam1",
		RTSPURL:         "rtsp://192.168.1.10:554/stream",
		RecordVideoMode: "h264",
	}
	storage := config.StorageConfig{Path: tmpDir}
	stream := ffprobe.StreamInfo{HasAudio: false}

	cmd := &fakeCommander{}
	rec := recorder.NewRecorder(camera, storage, stream, cmd, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	args := cmd.calls[0]
	if !containsSequence(args, "-c:v", "libx264") {
		t.Error("expected -c:v libx264 in args when RecordVideoMode=h264")
	}
	if !containsSequence(args, "-preset", "ultrafast") {
		t.Error("expected -preset ultrafast in args when RecordVideoMode=h264")
	}
	if containsSequence(args, "-c", "copy") {
		t.Error("expected no -c copy when transcoding")
	}
}

func TestRecorderTranscodesInAutoModeWithHEVCSource(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)

	camera := config.CameraConfig{
		ID:              "cam1",
		RTSPURL:         "rtsp://192.168.1.10:554/stream",
		RecordVideoMode: "", // auto
	}
	storage := config.StorageConfig{Path: tmpDir}
	stream := ffprobe.StreamInfo{VideoCodec: "hevc", HasAudio: false}

	cmd := &fakeCommander{}
	rec := recorder.NewRecorder(camera, storage, stream, cmd, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	args := cmd.calls[0]
	if !containsSequence(args, "-c:v", "libx264") {
		t.Error("expected -c:v libx264 in auto mode with hevc source")
	}
}

func TestRecorderCopiesInAutoModeWithH264Source(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)

	camera := config.CameraConfig{
		ID:              "cam1",
		RTSPURL:         "rtsp://192.168.1.10:554/stream",
		RecordVideoMode: "", // auto
	}
	storage := config.StorageConfig{Path: tmpDir}
	stream := ffprobe.StreamInfo{VideoCodec: "h264", HasAudio: false}

	cmd := &fakeCommander{}
	rec := recorder.NewRecorder(camera, storage, stream, cmd, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	args := cmd.calls[0]
	if !containsSequence(args, "-c", "copy") {
		t.Error("expected -c copy in auto mode with h264 source")
	}
	if containsSequence(args, "-c:v", "libx264") {
		t.Error("expected no libx264 in auto mode with h264 source")
	}
}

func TestRecorderCopiesWhenModeIsCopy(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)

	camera := config.CameraConfig{
		ID:              "cam1",
		RTSPURL:         "rtsp://192.168.1.10:554/stream",
		RecordVideoMode: "copy",
	}
	storage := config.StorageConfig{Path: tmpDir}
	stream := ffprobe.StreamInfo{VideoCodec: "hevc", HasAudio: false}

	cmd := &fakeCommander{}
	rec := recorder.NewRecorder(camera, storage, stream, cmd, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	args := cmd.calls[0]
	if !containsSequence(args, "-c", "copy") {
		t.Error("expected -c copy when RecordVideoMode=copy, regardless of source codec")
	}
}

func TestRecorderTranscodeWithAudioUsesAudioCopy(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)

	camera := config.CameraConfig{
		ID:              "cam1",
		RTSPURL:         "rtsp://192.168.1.10:554/stream",
		RecordVideoMode: "h264",
	}
	storage := config.StorageConfig{Path: tmpDir}
	stream := ffprobe.StreamInfo{VideoCodec: "hevc", HasAudio: true}

	cmd := &fakeCommander{}
	rec := recorder.NewRecorder(camera, storage, stream, cmd, discardLogger())
	if err := rec.Start(ts); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	args := cmd.calls[0]
	if !containsSequence(args, "-c:a", "copy") {
		t.Error("expected -c:a copy when transcoding video but audio is present")
	}
	if containsArg(args, "-an") {
		t.Error("expected no -an when audio is present during transcoding")
	}
}

func TestRecorderRunRestartsAfterUnexpectedExit(t *testing.T) {
	tmpDir := t.TempDir()
	camera := config.CameraConfig{ID: "cam1", RTSPURL: "rtsp://192.168.1.10:554/stream"}
	storage := config.StorageConfig{Path: tmpDir}

	// fakeProcess.Wait() returns immediately — simulates ffmpeg dying right away.
	cmd := newCountingCommander(3, func(n int) exec.Process { return &fakeProcess{} })

	rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, cmd, discardLogger())

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		rec.Run(ctx, time.Millisecond)
	}()

	select {
	case <-cmd.reached:
	case <-time.After(2 * time.Second):
		t.Fatal("expected recorder to restart at least 3 times within 2s")
	}
	cancel()
	<-done
}

// TestRecorderStallEvents cobre a história feat/modulo-eventos-centralizado
// (incidente 2026-08-26: ffmpeg travado sem sair nunca avisava ninguém) —
// aqui simulamos o "sai sozinho" (já corrigido no lado ffmpeg pelo
// -rw_timeout de internal/capturer/rtsp, T2) e checamos que o Recorder
// publica os eventos correspondentes no bus.
func TestRecorderStallEvents(t *testing.T) {
	t.Run("CA3: recorder publica recorder.stopped quando o ffmpeg sai inesperadamente", func(t *testing.T) {
		tmpDir := t.TempDir()
		camera := config.CameraConfig{ID: "cam1", RTSPURL: "rtsp://192.168.1.10:554/stream"}
		storage := config.StorageConfig{Path: tmpDir}

		bus := events.NewBus()
		stopped, unsubscribe := bus.Subscribe(recorder.EventStopped)
		defer unsubscribe()

		// fakeProcess.Wait() retorna na hora — simula o ffmpeg saindo
		// sozinho (já corrigido pelo -rw_timeout, T2).
		cmd := &fakeCommander{}
		rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, cmd, discardLogger()).WithEvents(bus)

		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			defer close(done)
			rec.Run(ctx, 10*time.Millisecond)
		}()

		select {
		case ev := <-stopped:
			if ev.CameraID != "cam1" {
				t.Errorf("CameraID = %q, want %q", ev.CameraID, "cam1")
			}
		case <-time.After(2 * time.Second):
			t.Fatal("esperava receber recorder.stopped após o ffmpeg sair inesperadamente")
		}
		cancel()
		<-done
	})

	t.Run("CA3: recorder publica recorder.recovered ao reiniciar com sucesso após uma parada", func(t *testing.T) {
		tmpDir := t.TempDir()
		camera := config.CameraConfig{ID: "cam1", RTSPURL: "rtsp://192.168.1.10:554/stream"}
		storage := config.StorageConfig{Path: tmpDir}

		bus := events.NewBus()
		recovered, unsubscribe := bus.Subscribe(recorder.EventRecovered)
		defer unsubscribe()

		// toda chamada a Start() "funciona" e o processo sai logo em seguida
		// (fakeProcess) — o 2º Start() bem-sucedido já conta como
		// recuperação de uma parada anterior.
		cmd := newCountingCommander(2, func(n int) exec.Process { return &fakeProcess{} })
		rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, cmd, discardLogger()).WithEvents(bus)

		ctx, cancel := context.WithCancel(context.Background())
		done := make(chan struct{})
		go func() {
			defer close(done)
			rec.Run(ctx, 10*time.Millisecond)
		}()

		select {
		case ev := <-recovered:
			if ev.CameraID != "cam1" {
				t.Errorf("CameraID = %q, want %q", ev.CameraID, "cam1")
			}
		case <-time.After(2 * time.Second):
			t.Fatal("esperava receber recorder.recovered após reiniciar com sucesso")
		}
		cancel()
		<-done
	})
}

func TestDurationUntilNextDay(t *testing.T) {
	cases := []struct {
		name string
		t    time.Time
		want time.Duration
	}{
		{"one minute before midnight", time.Date(2026, 4, 30, 23, 59, 0, 0, time.UTC), time.Minute},
		{"midday", time.Date(2026, 4, 30, 12, 0, 0, 0, time.UTC), 12 * time.Hour},
		{"exactly midnight returns full day", time.Date(2026, 4, 30, 0, 0, 0, 0, time.UTC), 24 * time.Hour},
		{"non-utc input is normalized", time.Date(2026, 4, 30, 23, 59, 0, 0, time.FixedZone("x", 3600)), time.Hour + time.Minute},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := recorder.DurationUntilNextDay(tc.t); got != tc.want {
				t.Errorf("DurationUntilNextDay(%v) = %v, want %v", tc.t, got, tc.want)
			}
		})
	}
}

func TestRecorderRunStopsOnContextCancel(t *testing.T) {
	tmpDir := t.TempDir()
	camera := config.CameraConfig{ID: "cam1", RTSPURL: "rtsp://192.168.1.10:554/stream"}
	storage := config.StorageConfig{Path: tmpDir}

	proc := newBlockingProcess()
	cmd := &fakeCommander{process: proc}

	rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, cmd, discardLogger())

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		rec.Run(ctx, time.Second)
	}()

	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after context cancel")
	}
}

// --- capture_type (história feat/hls-capture-fundacao) ---

func TestRecorderCaptureType(t *testing.T) {
	tmpDir := t.TempDir()
	ts := time.Date(2026, 4, 30, 14, 30, 0, 0, time.UTC)
	storage := config.StorageConfig{Path: tmpDir}

	t.Run("CA4: capture_type=hls usa internal/capturer/hls (sem -rtsp_transport tcp)", func(t *testing.T) {
		camera := config.CameraConfig{
			ID:          "cam-hls",
			RTSPURL:     "https://cam.example.com/stream/playlist.m3u8",
			CaptureType: "hls",
		}
		cmd := &fakeCommander{}
		rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, cmd, discardLogger())
		if err := rec.Start(ts); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		args := cmd.calls[0]
		if containsSequence(args, "-rtsp_transport", "tcp") {
			t.Error("capture_type=hls não deve emitir -rtsp_transport tcp")
		}
		if !containsSequence(args, "-i", "https://cam.example.com/stream/playlist.m3u8") {
			t.Error("expected -i <url> in args")
		}
	})

	t.Run("CA4: capture_type default (vazio) preserva o comportamento RTSP atual", func(t *testing.T) {
		camera := config.CameraConfig{
			ID:      "cam-rtsp",
			RTSPURL: "rtsp://192.168.1.10:554/stream",
		}
		cmd := &fakeCommander{}
		rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, cmd, discardLogger())
		if err := rec.Start(ts); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		args := cmd.calls[0]
		if !containsSequence(args, "-rtsp_transport", "tcp") {
			t.Error("capture_type default deve continuar forçando -rtsp_transport tcp")
		}
		if !containsSequence(args, "-i", "rtsp://192.168.1.10:554/stream") {
			t.Error("expected -i <rtsp_url> in args")
		}
	})

	// --- MJPEG removido (história chore/remover-mjpeg-backend) ---

	t.Run("CA3: capture_type=mjpeg não é mais especial-casado — produz os mesmos args que o default (rtsp)", func(t *testing.T) {
		camera := config.CameraConfig{
			ID:          "cam-mjpeg",
			RTSPURL:     "https://195.196.36.242/mjpg/video.mjpg",
			CaptureType: "mjpeg",
		}
		cmd := &fakeCommander{}
		rec := recorder.NewRecorder(camera, storage, ffprobe.StreamInfo{}, cmd, discardLogger())
		if err := rec.Start(ts); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		args := cmd.calls[0]
		if !containsSequence(args, "-rtsp_transport", "tcp") {
			t.Error("capture_type=mjpeg deveria cair no default e forçar -rtsp_transport tcp, como qualquer capture_type não reconhecido")
		}
		if !containsSequence(args, "-i", "https://195.196.36.242/mjpg/video.mjpg") {
			t.Error("expected -i <url> in args")
		}
	})
}
