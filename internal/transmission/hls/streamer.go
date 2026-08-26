package hls

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	capturehls "camera/internal/capturer/hls"
	"camera/internal/capturer/rtsp"
	"camera/internal/config"
	"camera/internal/core"
	"camera/internal/events"
	"camera/internal/exec"
	"camera/internal/ffprobe"
)

// Tipos de evento publicados no events.Bus (ver WithEvents) — história
// feat/modulo-eventos-centralizado.
const (
	EventStopped   = "transmission.stopped"
	EventRecovered = "transmission.recovered"
)

type HLSStreamer struct {
	camera    config.CameraConfig
	server    config.ServerConfig
	stream    ffprobe.StreamInfo
	commander exec.Commander
	log       *slog.Logger
	process   exec.Process
	events    *events.Bus
}

func NewHLSStreamer(camera config.CameraConfig, server config.ServerConfig, stream ffprobe.StreamInfo, commander exec.Commander, log *slog.Logger) *HLSStreamer {
	return &HLSStreamer{
		camera:    camera,
		server:    server,
		stream:    stream,
		commander: commander,
		log:       log,
	}
}

func (s *HLSStreamer) Start() error {
	dir := filepath.Join(s.server.SegmentsPath, s.camera.ID)
	s.log.Debug("creating segments directory", "path", dir, "camera", s.camera.ID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	playlist := filepath.Join(dir, "index.m3u8")
	segmentPattern := filepath.Join(dir, "%06d.ts")
	s.log.Debug("starting hls ffmpeg", "camera", s.camera.ID, "playlist", playlist)
	captureType := s.camera.EffectiveCaptureType()
	var args []string
	if core.NeedsRTSPTransport(captureType) {
		args = rtsp.TransportArgs()
	}
	args = append(args,
		"-fflags", "+nobuffer",
		"-flags", "+low_delay",
		"-analyzeduration", "500000",
		"-probesize", "32768",
	)
	switch captureType {
	case "hls":
		args = append(args, capturehls.ConnectArgs(s.camera.RTSPURL)...)
	default:
		args = append(args, core.InputArgs(s.camera.RTSPURL)...)
	}
	needsTranscode := s.needsTranscode()
	if needsTranscode {
		s.log.Warn("transcoding video to h264", "camera", s.camera.ID, "source_codec", s.stream.VideoCodec, "mode", s.camera.HLSVideoMode)
	}
	args = append(args, core.TranscodeArgs(needsTranscode, s.stream.HasAudio)...)

	segmentSeconds := s.camera.HLSSegmentSecondsOrDefault()
	listSize, hlsFlags := hlsListSizeAndFlags(s.camera.HLSDVRSecondsOrDefault(), segmentSeconds, s.camera.HLSListSizeOrDefault())
	args = append(args,
		"-f", "hls",
		"-hls_time", strconv.Itoa(segmentSeconds),
		"-hls_list_size", strconv.Itoa(listSize),
		"-hls_flags", hlsFlags,
		"-hls_segment_filename", segmentPattern,
		playlist,
	)
	proc, err := s.commander.Start("ffmpeg", args...)
	if err != nil {
		return fmt.Errorf("failed to start hls streamer for camera %s: %w", s.camera.ID, err)
	}
	s.process = proc
	s.log.Info("hls streaming started", "camera", s.camera.ID, "playlist", playlist)
	return nil
}

// WithEvents injeta o barramento de eventos operacionais — opcional (zero
// value nil continua seguro, publish vira no-op), mesmo padrão chainable de
// server.WithVersion/WithDB/etc.
func (s *HLSStreamer) WithEvents(bus *events.Bus) *HLSStreamer {
	s.events = bus
	return s
}

func (s *HLSStreamer) publish(eventType string) {
	if s.events == nil {
		return
	}
	s.events.Publish(events.Event{Type: eventType, CameraID: s.camera.ID, At: time.Now()})
}

func (s *HLSStreamer) Run(ctx context.Context, reconnect time.Duration) {
	stopped := false // true depois de um EventStopped ainda não seguido de EventRecovered
	for {
		if err := s.Start(); err != nil {
			s.log.Error("hls: failed to start", "camera", s.camera.ID, "error", err)
		} else {
			if stopped {
				s.publish(EventRecovered)
				stopped = false
			}
			exited := make(chan struct{})
			go func() { s.process.Wait(); close(exited) }()
			select {
			case <-ctx.Done():
				s.Stop()
				<-exited
				return
			case <-exited:
				s.log.Warn("hls: process exited unexpectedly", "camera", s.camera.ID)
				s.publish(EventStopped)
				stopped = true
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnect):
			s.log.Info("hls: reconnecting", "camera", s.camera.ID)
		}
	}
}

func (s *HLSStreamer) Stop() {
	if s.process == nil {
		return
	}
	s.log.Info("stopping hls streamer", "camera", s.camera.ID)
	s.process.Terminate()
	s.process.Wait()
}

func (s *HLSStreamer) needsTranscode() bool {
	return core.NeedsTranscode(s.camera.HLSVideoMode, s.stream.VideoCodec)
}

func hlsListSizeAndFlags(dvrSeconds, segmentSeconds, defaultListSize int) (listSize int, flags string) {
	if dvrSeconds <= 0 {
		return defaultListSize, "delete_segments+append_list+independent_segments"
	}
	size := dvrSeconds / segmentSeconds
	if size < defaultListSize {
		size = defaultListSize
	}
	parts := []string{"append_list", "independent_segments", "program_date_time"}
	return size, strings.Join(parts, "+")
}
