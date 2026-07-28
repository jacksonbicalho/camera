package live

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// fakeSource emits synthetic RTP packets (H.264-shaped or otherwise — the
// payload doesn't matter to Publisher, which just forwards bytes) until the
// context is cancelled, standing in for a real RTSP/ffmpeg source so tests
// need no camera, network, or ffmpeg binary.
type fakeSource struct {
	mu       sync.Mutex
	returned bool
	payload  []byte
}

func (f *fakeSource) ReadRTP(ctx context.Context, onPacket func(*rtp.Packet)) error {
	defer func() {
		f.mu.Lock()
		f.returned = true
		f.mu.Unlock()
	}()
	payload := f.payload
	if payload == nil {
		payload = []byte{0x00, 0x00, 0x01, 0x65, 0x00}
	}
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	var seq uint16
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			seq++
			onPacket(&rtp.Packet{
				Header: rtp.Header{
					Version:        2,
					PayloadType:    96,
					SequenceNumber: seq,
					Timestamp:      uint32(seq) * 3000,
				},
				Payload: payload,
			})
		}
	}
}

func (f *fakeSource) hasReturned() bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.returned
}

// newViewer creates a recvonly PeerConnection (the browser side) with a
// fully-gathered offer, ready to hand to Publisher.Negotiate. withAudio also
// offers a recvonly audio transceiver, mirroring Player.tsx.
func newViewer(t *testing.T, withAudio bool) (*webrtc.PeerConnection, webrtc.SessionDescription) {
	t.Helper()
	pc, err := webrtc.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		t.Fatalf("client peer connection: %v", err)
	}
	if _, err := pc.AddTransceiverFromKind(webrtc.RTPCodecTypeVideo,
		webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
		t.Fatalf("add video transceiver: %v", err)
	}
	if withAudio {
		if _, err := pc.AddTransceiverFromKind(webrtc.RTPCodecTypeAudio,
			webrtc.RTPTransceiverInit{Direction: webrtc.RTPTransceiverDirectionRecvonly}); err != nil {
			t.Fatalf("add audio transceiver: %v", err)
		}
	}
	offer, err := pc.CreateOffer(nil)
	if err != nil {
		t.Fatalf("create offer: %v", err)
	}
	gather := webrtc.GatheringCompletePromise(pc)
	if err := pc.SetLocalDescription(offer); err != nil {
		t.Fatalf("set local description: %v", err)
	}
	<-gather
	return pc, *pc.LocalDescription()
}

func TestPublisherNegotiatesAndForwardsRTP(t *testing.T) {
	pub, err := NewPublisher("cam1", &fakeSource{}, nil, AudioFormat{}, discardLogger())
	if err != nil {
		t.Fatalf("new publisher: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go pub.Run(ctx, time.Second)

	client, offer := newViewer(t, false)
	defer client.Close()

	gotRTP := make(chan struct{}, 1)
	client.OnTrack(func(tr *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		for {
			if _, _, err := tr.ReadRTP(); err != nil {
				return
			}
			select {
			case gotRTP <- struct{}{}:
			default:
			}
		}
	})

	answer, err := pub.Negotiate(offer, "203.0.113.1")
	if err != nil {
		t.Fatalf("negotiate: %v", err)
	}
	if !strings.Contains(strings.ToLower(answer.SDP), "h264") {
		t.Fatalf("answer SDP missing h264 codec:\n%s", answer.SDP)
	}
	if err := client.SetRemoteDescription(answer); err != nil {
		t.Fatalf("set remote description: %v", err)
	}

	select {
	case <-gotRTP:
	case <-time.After(15 * time.Second):
		t.Fatal("did not receive forwarded RTP within timeout")
	}
}

// CA2: ConnectedIPs deduplica por IP — várias conexões do mesmo IP (ex. um viewer com vários
// tiles abertos na LiveViewPage) contam como 1; IPs diferentes contam separadamente; fechar a
// ÚLTIMA conexão de um IP o remove da lista.
func TestPublisherConnectedIPsDedupesByClientIP(t *testing.T) {
	pub, err := NewPublisher("cam1", &fakeSource{}, nil, AudioFormat{}, discardLogger())
	if err != nil {
		t.Fatalf("new publisher: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go pub.Run(ctx, time.Second)

	negotiate := func(ip string) *webrtc.PeerConnection {
		t.Helper()
		client, offer := newViewer(t, false)
		t.Cleanup(func() { client.Close() })
		answer, err := pub.Negotiate(offer, ip)
		if err != nil {
			t.Fatalf("negotiate: %v", err)
		}
		if err := client.SetRemoteDescription(answer); err != nil {
			t.Fatalf("set remote description: %v", err)
		}
		return client
	}

	negotiate("203.0.113.1")
	negotiate("203.0.113.1") // 2ª conexão do MESMO IP (ex. 2º tile do grid)
	negotiate("198.51.100.9")

	if got := pub.Sessions(); got != 3 {
		t.Fatalf("expected 3 raw sessions, got %d", got)
	}
	ips := pub.ConnectedIPs()
	if len(ips) != 2 {
		t.Fatalf("expected 2 distinct IPs, got %d: %v", len(ips), ips)
	}
	want := map[string]bool{"203.0.113.1": true, "198.51.100.9": true}
	for _, ip := range ips {
		if !want[ip] {
			t.Errorf("unexpected IP in ConnectedIPs: %q", ip)
		}
	}

	// Fecha as 2 conexões do IP duplicado uma de cada vez: some só depois da ÚLTIMA.
	closeOneServerSidePCFor := func(ip string) {
		t.Helper()
		pub.mu.Lock()
		var target *webrtc.PeerConnection
		for pc, pcIP := range pub.pcs {
			if pcIP == ip {
				target = pc
				break
			}
		}
		pub.mu.Unlock()
		if target == nil {
			t.Fatalf("no open server-side PeerConnection found for IP %q", ip)
		}
		if err := target.Close(); err != nil {
			t.Fatalf("close server-side pc: %v", err)
		}
		// Close() dispara OnConnectionStateChange de forma assíncrona internamente no pion —
		// espera p.remove terminar (mesmo padrão de polling com timeout já usado nos outros
		// testes deste arquivo, ex. gotRTP/gotAudio).
		deadline := time.Now().Add(5 * time.Second)
		for {
			pub.mu.Lock()
			_, stillOpen := pub.pcs[target]
			pub.mu.Unlock()
			if !stillOpen {
				return
			}
			if time.Now().After(deadline) {
				t.Fatal("timed out waiting for Publisher to remove the closed connection")
			}
			time.Sleep(10 * time.Millisecond)
		}
	}

	closeOneServerSidePCFor("203.0.113.1")
	ips = pub.ConnectedIPs()
	if len(ips) != 2 {
		t.Fatalf("after closing 1 of 2 connections from the same IP, expected it to remain (2 distinct IPs), got %d: %v", len(ips), ips)
	}

	closeOneServerSidePCFor("203.0.113.1")
	ips = pub.ConnectedIPs()
	if len(ips) != 1 || ips[0] != "198.51.100.9" {
		t.Fatalf("after closing the LAST connection from 203.0.113.1, expected only 198.51.100.9 left, got %v", ips)
	}
}

func TestPublisherClosesSessionAndSourceOnCancel(t *testing.T) {
	src := &fakeSource{}
	pub, err := NewPublisher("cam1", src, nil, AudioFormat{}, discardLogger())
	if err != nil {
		t.Fatalf("new publisher: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { pub.Run(ctx, time.Second); close(done) }()

	client, offer := newViewer(t, false)
	defer client.Close()
	answer, err := pub.Negotiate(offer, "203.0.113.1")
	if err != nil {
		t.Fatalf("negotiate: %v", err)
	}
	if err := client.SetRemoteDescription(answer); err != nil {
		t.Fatalf("set remote description: %v", err)
	}
	if pub.Sessions() != 1 {
		t.Fatalf("expected 1 session after negotiate, got %d", pub.Sessions())
	}

	cancel()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("Run did not return after context cancel")
	}
	if !src.hasReturned() {
		t.Fatal("source ReadRTP did not return after cancel (leak)")
	}
	if pub.Sessions() != 0 {
		t.Fatalf("expected 0 sessions after cancel, got %d", pub.Sessions())
	}
}

func TestPublisherWithG711AudioAnnouncesAndForwardsAudioRTP(t *testing.T) {
	audioSrc := &fakeSource{payload: []byte{0xaa, 0xbb, 0xcc, 0xdd}}
	pub, err := NewPublisher("cam1", &fakeSource{}, audioSrc, AudioFormat{Present: true, MULaw: false}, discardLogger())
	if err != nil {
		t.Fatalf("new publisher: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go pub.Run(ctx, time.Second)

	client, offer := newViewer(t, true)
	defer client.Close()

	gotAudio := make(chan struct{}, 1)
	client.OnTrack(func(tr *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		if tr.Kind() != webrtc.RTPCodecTypeAudio {
			return
		}
		for {
			if _, _, err := tr.ReadRTP(); err != nil {
				return
			}
			select {
			case gotAudio <- struct{}{}:
			default:
			}
		}
	})

	answer, err := pub.Negotiate(offer, "203.0.113.1")
	if err != nil {
		t.Fatalf("negotiate: %v", err)
	}
	if !strings.Contains(strings.ToLower(answer.SDP), "pcma") {
		t.Fatalf("answer SDP missing pcma codec:\n%s", answer.SDP)
	}
	if err := client.SetRemoteDescription(answer); err != nil {
		t.Fatalf("set remote description: %v", err)
	}

	select {
	case <-gotAudio:
	case <-time.After(15 * time.Second):
		t.Fatal("did not receive forwarded audio RTP within timeout")
	}
}

func TestPublisherWithTranscodedAudioAnnouncesOpus(t *testing.T) {
	audioSrc := &fakeSource{payload: []byte{0x01, 0x02, 0x03}}
	pub, err := NewPublisher("cam1", &fakeSource{}, audioSrc, AudioFormat{Present: true, Transcode: true}, discardLogger())
	if err != nil {
		t.Fatalf("new publisher: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go pub.Run(ctx, time.Second)

	client, offer := newViewer(t, true)
	defer client.Close()

	gotAudio := make(chan struct{}, 1)
	client.OnTrack(func(tr *webrtc.TrackRemote, _ *webrtc.RTPReceiver) {
		if tr.Kind() != webrtc.RTPCodecTypeAudio {
			return
		}
		for {
			if _, _, err := tr.ReadRTP(); err != nil {
				return
			}
			select {
			case gotAudio <- struct{}{}:
			default:
			}
		}
	})

	answer, err := pub.Negotiate(offer, "203.0.113.1")
	if err != nil {
		t.Fatalf("negotiate: %v", err)
	}
	if !strings.Contains(strings.ToLower(answer.SDP), "opus") {
		t.Fatalf("answer SDP missing opus codec:\n%s", answer.SDP)
	}
	if err := client.SetRemoteDescription(answer); err != nil {
		t.Fatalf("set remote description: %v", err)
	}

	select {
	case <-gotAudio:
	case <-time.After(15 * time.Second):
		t.Fatal("did not receive forwarded audio RTP within timeout")
	}
}

func TestPublisherWithoutAudioStillNegotiatesWhenViewerOffersAudio(t *testing.T) {
	pub, err := NewPublisher("cam1", &fakeSource{}, nil, AudioFormat{}, discardLogger())
	if err != nil {
		t.Fatalf("new publisher: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go pub.Run(ctx, time.Second)

	client, offer := newViewer(t, true)
	defer client.Close()

	answer, err := pub.Negotiate(offer, "203.0.113.1")
	if err != nil {
		t.Fatalf("negotiate: %v", err)
	}
	if err := client.SetRemoteDescription(answer); err != nil {
		t.Fatalf("set remote description: %v", err)
	}
	if pub.Sessions() != 1 {
		t.Fatalf("expected 1 session after negotiate, got %d", pub.Sessions())
	}
}
