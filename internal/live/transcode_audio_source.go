package live

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"time"

	"camera/internal/exec"

	"github.com/pion/rtp"
)

// TranscodeAudioSource spawns ffmpeg to pull an RTSP camera's audio, decode
// it and re-encode to Opus, forwarding the resulting RTP packets. This is the
// one audio path in this package that actually transcodes — RTSPAudioSource
// (G.711) and the video path are pure repackage, zero CPU; this trades CPU
// for compatibility with WebRTC browsers, which don't support AAC (the most
// common source codec on IP cameras that isn't G.711).
type TranscodeAudioSource struct {
	url       string
	commander exec.Commander
	log       *slog.Logger
}

// NewTranscodeAudioSource returns a Source that transcodes the given RTSP
// URL's audio to Opus via ffmpeg. Only worth using when ProbeAudio reports
// AudioFormat{Present: true, Transcode: true} — for G.711 use
// RTSPAudioSource instead (no ffmpeg process, no CPU cost).
func NewTranscodeAudioSource(url string, commander exec.Commander, log *slog.Logger) *TranscodeAudioSource {
	return &TranscodeAudioSource{url: url, commander: commander, log: log}
}

func (s *TranscodeAudioSource) ReadRTP(ctx context.Context, onPacket func(*rtp.Packet)) error {
	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		return fmt.Errorf("listen udp: %w", err)
	}
	defer conn.Close()
	port := conn.LocalAddr().(*net.UDPAddr).Port

	// -vn drops the video stream entirely (ffmpeg only needs to demux/decode
	// audio here); libopus mono 48kHz matches what pion's default-registered
	// Opus codec expects. The rtp:// muxer packetizes Opus into standard RTP
	// itself, sent over loopback UDP to the port we're about to read from —
	// same "repackage what ffmpeg hands us" pattern as the RTSP sources, just
	// with ffmpeg doing the codec work instead of a straight copy.
	args := []string{
		"-rtsp_transport", "tcp", "-i", s.url,
		"-vn", "-acodec", "libopus", "-ar", "48000", "-ac", "1",
		"-f", "rtp", fmt.Sprintf("rtp://127.0.0.1:%d", port),
	}
	proc, err := s.commander.Start("ffmpeg", args...)
	if err != nil {
		return fmt.Errorf("start ffmpeg: %w", err)
	}
	exited := make(chan struct{})
	go func() {
		if werr := proc.Wait(); werr != nil {
			s.log.Debug("live: transcode ffmpeg exited", "url", s.url, "error", werr)
		}
		close(exited)
	}()
	defer func() {
		_ = proc.Terminate()
		<-exited
	}()

	go func() {
		select {
		case <-ctx.Done():
		case <-exited:
		}
		_ = conn.SetReadDeadline(time.Now())
	}()

	buf := make([]byte, 1500)
	for {
		n, err := conn.Read(buf)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			select {
			case <-exited:
				return errors.New("transcode ffmpeg exited")
			default:
				return fmt.Errorf("read rtp: %w", err)
			}
		}
		pkt := &rtp.Packet{}
		if err := pkt.Unmarshal(buf[:n]); err != nil {
			continue
		}
		onPacket(pkt)
	}
}
