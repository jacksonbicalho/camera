package live

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/bluenviron/gortsplib/v4"
	"github.com/bluenviron/gortsplib/v4/pkg/base"
	"github.com/bluenviron/gortsplib/v4/pkg/description"
	"github.com/bluenviron/gortsplib/v4/pkg/format"
	"github.com/pion/rtp"
)

// ErrNoH264 is returned when the RTSP stream exposes no H.264 media. WebRTC in
// browsers requires H.264, so a stream without it cannot be repackaged and the
// caller should fall back to HLS.
var ErrNoH264 = errors.New("rtsp stream has no h264 media")

// ErrNoAudio is returned when the RTSP stream exposes no audio media at all.
var ErrNoAudio = errors.New("rtsp stream has no audio media")

// AudioFormat describes the camera's audio, detected once via ProbeAudio
// before building its Publisher, and used to decide which audio Source (if
// any) main.go should construct alongside it:
//   - Present && !Transcode: G.711 (PCMA/PCMU) — both common IP cameras and
//     WebRTC browsers (RFC 7874) share this codec natively, so it's
//     repackaged without transcoding (RTSPAudioSource), mirroring the H.264
//     video path.
//   - Present && Transcode: audio exists but isn't G.711 (AAC and friends) —
//     WebRTC browsers can't play those, so it needs a real-time transcode to
//     Opus (TranscodeAudioSource) to get any sound at all.
//   - !Present: no audio media in the stream.
type AudioFormat struct {
	Present   bool
	MULaw     bool // true = PCMU (μ-law), false = PCMA (A-law); meaningless unless Present && !Transcode
	Transcode bool
}

// ProbeAudio opens a short-lived RTSP session (DESCRIBE only, no SETUP/PLAY)
// to classify the camera's audio. Meant to be called once per camera before
// building its Publisher — mirrors the one-time ffprobe.Resolve call already
// done for the video codec in main.go, kept separate from it because the
// audio codec isn't persisted to the database (unlike video_codec/has_audio),
// so re-probing here (cheap, RTSP-native) avoids a schema change.
func ProbeAudio(_ context.Context, url string) (AudioFormat, error) {
	u, err := base.ParseURL(url)
	if err != nil {
		return AudioFormat{}, fmt.Errorf("parse rtsp url: %w", err)
	}

	transport := gortsplib.TransportTCP
	c := &gortsplib.Client{Transport: &transport}
	if err := c.Start(u.Scheme, u.Host); err != nil {
		return AudioFormat{}, fmt.Errorf("rtsp start: %w", err)
	}
	defer c.Close()

	desc, _, err := c.Describe(u)
	if err != nil {
		return AudioFormat{}, fmt.Errorf("rtsp describe: %w", err)
	}

	var g711 *format.G711
	if medi := desc.FindFormat(&g711); medi != nil {
		return AudioFormat{Present: true, MULaw: g711.MULaw}, nil
	}
	for _, m := range desc.Medias {
		if m.Type == description.MediaTypeAudio {
			return AudioFormat{Present: true, Transcode: true}, nil
		}
	}
	return AudioFormat{}, nil
}

// RTSPSource pulls an H.264 video stream from an RTSP URL over TCP and
// forwards its RTP packets unchanged. It implements Source. Transport is TCP
// to match the recorder/HLS pipelines (interleaved, firewall-friendly, no UDP
// reordering).
type RTSPSource struct {
	url string
	log *slog.Logger
}

// NewRTSPSource returns a Source backed by the given RTSP URL.
func NewRTSPSource(url string, log *slog.Logger) *RTSPSource {
	return &RTSPSource{url: url, log: log}
}

func (s *RTSPSource) ReadRTP(ctx context.Context, onPacket func(*rtp.Packet)) error {
	u, err := base.ParseURL(s.url)
	if err != nil {
		return fmt.Errorf("parse rtsp url: %w", err)
	}

	transport := gortsplib.TransportTCP
	c := &gortsplib.Client{Transport: &transport}
	if err := c.Start(u.Scheme, u.Host); err != nil {
		return fmt.Errorf("rtsp start: %w", err)
	}
	defer c.Close()

	desc, _, err := c.Describe(u)
	if err != nil {
		return fmt.Errorf("rtsp describe: %w", err)
	}

	var forma *format.H264
	medi := desc.FindFormat(&forma)
	if medi == nil {
		return ErrNoH264
	}
	if _, err := c.Setup(desc.BaseURL, medi, 0, 0); err != nil {
		return fmt.Errorf("rtsp setup: %w", err)
	}
	c.OnPacketRTP(medi, forma, onPacket)

	if _, err := c.Play(nil); err != nil {
		return fmt.Errorf("rtsp play: %w", err)
	}

	return waitRTSP(ctx, c)
}

// RTSPAudioSource pulls a G.711 audio stream from an RTSP URL over TCP and
// forwards its RTP packets unchanged — a separate RTSP session from
// RTSPSource's video, kept independent so audio and video reconnect/fail on
// their own without one taking the other down (and so this Source has the
// exact same shape as TranscodeAudioSource from Publisher's point of view).
type RTSPAudioSource struct {
	url string
	log *slog.Logger
}

// NewRTSPAudioSource returns a Source backed by the given RTSP URL's G.711
// audio media. Only call this when ProbeAudio already confirmed G.711 is
// present — ReadRTP returns ErrNoAudio otherwise.
func NewRTSPAudioSource(url string, log *slog.Logger) *RTSPAudioSource {
	return &RTSPAudioSource{url: url, log: log}
}

func (s *RTSPAudioSource) ReadRTP(ctx context.Context, onPacket func(*rtp.Packet)) error {
	u, err := base.ParseURL(s.url)
	if err != nil {
		return fmt.Errorf("parse rtsp url: %w", err)
	}

	transport := gortsplib.TransportTCP
	c := &gortsplib.Client{Transport: &transport}
	if err := c.Start(u.Scheme, u.Host); err != nil {
		return fmt.Errorf("rtsp start: %w", err)
	}
	defer c.Close()

	desc, _, err := c.Describe(u)
	if err != nil {
		return fmt.Errorf("rtsp describe: %w", err)
	}

	var g711 *format.G711
	medi := desc.FindFormat(&g711)
	if medi == nil {
		return ErrNoAudio
	}
	if _, err := c.Setup(desc.BaseURL, medi, 0, 0); err != nil {
		return fmt.Errorf("rtsp setup: %w", err)
	}
	c.OnPacketRTP(medi, g711, onPacket)

	if _, err := c.Play(nil); err != nil {
		return fmt.Errorf("rtsp play: %w", err)
	}

	return waitRTSP(ctx, c)
}

// waitRTSP blocks until the RTSP session ends or ctx is cancelled, whichever
// comes first — shared by RTSPSource and RTSPAudioSource.
func waitRTSP(ctx context.Context, c *gortsplib.Client) error {
	errCh := make(chan error, 1)
	go func() { errCh <- c.Wait() }()
	select {
	case <-ctx.Done():
		return nil
	case err := <-errCh:
		return err
	}
}
