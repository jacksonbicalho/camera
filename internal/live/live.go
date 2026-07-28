// Package live implements low-latency WebRTC delivery of a camera's live feed.
// It pulls H.264 RTP from an RTSP source and repackages it to WebRTC viewers
// without transcoding: a Publisher holds a single shared H.264 track and fans
// each RTP packet out to every connected PeerConnection. This targets
// sub-second latency at near-zero CPU (no decode), unlike the segment-based
// HLS pipeline which floors around 5-6s.
package live

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"time"

	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
)

// Source is an RTP source of either H.264 video or audio (G.711 passthrough
// or transcoded Opus) — video and audio are two independent sources, each
// with their own connection/reconnect lifecycle. ReadRTP forwards each
// packet to onPacket until ctx is cancelled or a fatal error occurs; it
// returns nil on clean context cancellation. Defined here (consumer side) so
// tests can inject a fake that emits synthetic packets, with no camera and no
// network.
type Source interface {
	ReadRTP(ctx context.Context, onPacket func(*rtp.Packet)) error
}

// Publisher owns a single H.264 WebRTC track (and, when the camera has usable
// audio, a second audio track) for one camera and fans the RTP stream out to
// all connected viewer PeerConnections.
type Publisher struct {
	cameraID    string
	source      Source
	audioSource Source // nil when the camera has no usable audio
	track       *webrtc.TrackLocalStaticRTP
	audioTrack  *webrtc.TrackLocalStaticRTP // nil when audioSource is nil
	api         *webrtc.API
	log         *slog.Logger

	mu  sync.Mutex
	pcs map[*webrtc.PeerConnection]string // valor = IP do cliente que abriu essa conexão
}

// NewPublisher builds a Publisher with an H.264 track, and an audio track too
// when audioSource is non-nil (PCMA/PCMU for G.711 passthrough, Opus for a
// transcoding source — audio.MULaw/Transcode pick the mime type; audio itself
// is read only once Run is called, same as source).
func NewPublisher(cameraID string, source Source, audioSource Source, audio AudioFormat, log *slog.Logger) (*Publisher, error) {
	m := &webrtc.MediaEngine{}
	if err := m.RegisterDefaultCodecs(); err != nil {
		return nil, fmt.Errorf("register codecs: %w", err)
	}
	streamID := "os-camera-" + cameraID
	track, err := webrtc.NewTrackLocalStaticRTP(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeH264},
		"video", streamID,
	)
	if err != nil {
		return nil, fmt.Errorf("create track: %w", err)
	}
	p := &Publisher{
		cameraID: cameraID,
		source:   source,
		track:    track,
		api:      webrtc.NewAPI(webrtc.WithMediaEngine(m)),
		log:      log,
		pcs:      make(map[*webrtc.PeerConnection]string),
	}
	if audioSource != nil {
		mimeType := webrtc.MimeTypeOpus
		if !audio.Transcode {
			mimeType = webrtc.MimeTypePCMA
			if audio.MULaw {
				mimeType = webrtc.MimeTypePCMU
			}
		}
		// Same streamID as video: browsers group tracks sharing a stream ID
		// into a single MediaStream, so the frontend's one `ontrack` handler
		// (assigning `video.srcObject = event.streams[0]`) picks up both.
		audioTrack, err := webrtc.NewTrackLocalStaticRTP(
			webrtc.RTPCodecCapability{MimeType: mimeType},
			"audio", streamID,
		)
		if err != nil {
			return nil, fmt.Errorf("create audio track: %w", err)
		}
		p.audioSource = audioSource
		p.audioTrack = audioTrack
	}
	return p, nil
}

// Run reads source (and audioSource, if any) and writes every RTP packet to
// the matching track, reconnecting after failures until ctx is cancelled —
// video and audio reconnect independently, so a hiccup in one doesn't take
// the other down. On exit it closes all viewer connections.
func (p *Publisher) Run(ctx context.Context, reconnect time.Duration) {
	defer p.closeAll()
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		runSource(ctx, p.source, reconnect, p.log, p.cameraID, "video", func(pkt *rtp.Packet) {
			if werr := p.track.WriteRTP(pkt); werr != nil && !errors.Is(werr, io.ErrClosedPipe) {
				p.log.Debug("live: write rtp", "camera", p.cameraID, "error", werr)
			}
		})
	}()
	if p.audioSource != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			runSource(ctx, p.audioSource, reconnect, p.log, p.cameraID, "audio", func(pkt *rtp.Packet) {
				if werr := p.audioTrack.WriteRTP(pkt); werr != nil && !errors.Is(werr, io.ErrClosedPipe) {
					p.log.Debug("live: write audio rtp", "camera", p.cameraID, "error", werr)
				}
			})
		}()
	}
	wg.Wait()
}

// runSource drives one Source's reconnect loop, shared by Publisher.Run for
// both the video and (optional) audio source.
func runSource(ctx context.Context, src Source, reconnect time.Duration, log *slog.Logger, cameraID, kind string, onPacket func(*rtp.Packet)) {
	for {
		err := src.ReadRTP(ctx, onPacket)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Warn("live: source ended", "camera", cameraID, "kind", kind, "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnect):
			log.Info("live: reconnecting source", "camera", cameraID, "kind", kind)
		}
	}
}

// Negotiate completes the WebRTC handshake for one viewer: it creates a
// PeerConnection, attaches the shared track and returns the SDP answer. The
// connection is tracked (keyed by clientIP, for ConnectedIPs) and closed
// automatically when it fails or disconnects.
func (p *Publisher) Negotiate(offer webrtc.SessionDescription, clientIP string) (webrtc.SessionDescription, error) {
	pc, err := p.api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		return webrtc.SessionDescription{}, fmt.Errorf("new peer connection: %w", err)
	}
	if _, err := pc.AddTrack(p.track); err != nil {
		_ = pc.Close()
		return webrtc.SessionDescription{}, fmt.Errorf("add track: %w", err)
	}
	if p.audioTrack != nil {
		if _, err := pc.AddTrack(p.audioTrack); err != nil {
			_ = pc.Close()
			return webrtc.SessionDescription{}, fmt.Errorf("add audio track: %w", err)
		}
	}
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		switch state {
		case webrtc.PeerConnectionStateFailed,
			webrtc.PeerConnectionStateClosed,
			webrtc.PeerConnectionStateDisconnected:
			p.remove(pc)
		}
	})
	if err := pc.SetRemoteDescription(offer); err != nil {
		_ = pc.Close()
		return webrtc.SessionDescription{}, fmt.Errorf("set remote description: %w", err)
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		_ = pc.Close()
		return webrtc.SessionDescription{}, fmt.Errorf("create answer: %w", err)
	}
	// Gather all ICE candidates before returning: signaling here is a single
	// offer/answer exchange (no trickle), so the answer must carry candidates.
	gatherComplete := webrtc.GatheringCompletePromise(pc)
	if err := pc.SetLocalDescription(answer); err != nil {
		_ = pc.Close()
		return webrtc.SessionDescription{}, fmt.Errorf("set local description: %w", err)
	}
	<-gatherComplete

	p.mu.Lock()
	p.pcs[pc] = clientIP
	p.mu.Unlock()

	return *pc.LocalDescription(), nil
}

// Sessions returns the number of currently connected viewers (conexões
// abertas — não deduplicado por IP; ver ConnectedIPs pra isso).
func (p *Publisher) Sessions() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.pcs)
}

// ConnectedIPs devolve os IPs distintos com pelo menos uma PeerConnection
// aberta agora — um viewer com várias abas/tiles (ex. grid da LiveViewPage)
// conta uma vez só, igual ao streamSeen do HLS já faz.
func (p *Publisher) ConnectedIPs() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	seen := make(map[string]struct{}, len(p.pcs))
	for _, ip := range p.pcs {
		if ip == "" {
			continue
		}
		seen[ip] = struct{}{}
	}
	ips := make([]string, 0, len(seen))
	for ip := range seen {
		ips = append(ips, ip)
	}
	return ips
}

func (p *Publisher) remove(pc *webrtc.PeerConnection) {
	p.mu.Lock()
	_, ok := p.pcs[pc]
	delete(p.pcs, pc)
	p.mu.Unlock()
	if ok {
		_ = pc.Close()
	}
}

func (p *Publisher) closeAll() {
	p.mu.Lock()
	pcs := make([]*webrtc.PeerConnection, 0, len(p.pcs))
	for pc := range p.pcs {
		pcs = append(pcs, pc)
	}
	p.pcs = make(map[*webrtc.PeerConnection]string)
	p.mu.Unlock()
	for _, pc := range pcs {
		_ = pc.Close()
	}
}
