package live

import (
	"context"
	"net"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"camera/internal/exec"

	"github.com/pion/rtp"
)

var rtpURLPortRe = regexp.MustCompile(`rtp://127\.0\.0\.1:(\d+)`)

// udpSenderProcess is the exec.Process half of fakeFFmpegCommander: Wait
// blocks until Terminate, same contract as the real ffmpeg process.
type udpSenderProcess struct {
	done chan struct{}
	once sync.Once
}

func (p *udpSenderProcess) Terminate() error {
	p.once.Do(func() { close(p.done) })
	return nil
}

func (p *udpSenderProcess) Wait() error {
	<-p.done
	return nil
}

// fakeFFmpegCommander simulates ffmpeg's `-f rtp rtp://127.0.0.1:<port>`
// audio output: once Start is called, it sends synthetic Opus-shaped RTP
// packets to that port until Terminate, standing in for a real ffmpeg
// transcode so tests need no camera, network, or ffmpeg binary.
type fakeFFmpegCommander struct {
	mu    sync.Mutex
	calls [][]string
}

func (f *fakeFFmpegCommander) Start(name string, args ...string) (exec.Process, error) {
	f.mu.Lock()
	f.calls = append(f.calls, append([]string{name}, args...))
	f.mu.Unlock()

	var port string
	for _, a := range args {
		if m := rtpURLPortRe.FindStringSubmatch(a); m != nil {
			port = m[1]
		}
	}
	proc := &udpSenderProcess{done: make(chan struct{})}
	if port != "" {
		go sendFakeRTP(proc.done, port)
	}
	return proc, nil
}

func sendFakeRTP(done chan struct{}, port string) {
	addr, err := net.ResolveUDPAddr("udp", "127.0.0.1:"+port)
	if err != nil {
		return
	}
	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		return
	}
	defer conn.Close()
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	var seq uint16
	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			seq++
			pkt := &rtp.Packet{
				Header: rtp.Header{
					Version:        2,
					PayloadType:    111,
					SequenceNumber: seq,
					Timestamp:      uint32(seq) * 960,
				},
				Payload: []byte{0x01, 0x02, 0x03},
			}
			b, err := pkt.Marshal()
			if err != nil {
				continue
			}
			_, _ = conn.Write(b)
		}
	}
}

func TestTranscodeAudioSourceForwardsRTP(t *testing.T) {
	commander := &fakeFFmpegCommander{}
	src := NewTranscodeAudioSource("rtsp://fake/cam", commander, discardLogger())

	ctx, cancel := context.WithCancel(context.Background())
	got := make(chan struct{}, 1)
	done := make(chan error, 1)
	go func() {
		done <- src.ReadRTP(ctx, func(*rtp.Packet) {
			select {
			case got <- struct{}{}:
			default:
			}
		})
	}()

	select {
	case <-got:
	case <-time.After(5 * time.Second):
		t.Fatal("did not receive forwarded RTP within timeout")
	}

	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("ReadRTP returned error after cancel: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("ReadRTP did not return after cancel")
	}

	commander.mu.Lock()
	defer commander.mu.Unlock()
	if len(commander.calls) != 1 {
		t.Fatalf("expected 1 ffmpeg call, got %d", len(commander.calls))
	}
	args := commander.calls[0]
	if args[0] != "ffmpeg" {
		t.Fatalf("expected ffmpeg command, got %v", args)
	}
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "libopus") {
		t.Fatalf("expected libopus in ffmpeg args:\n%v", args)
	}
	if !strings.Contains(joined, "rtsp://fake/cam") {
		t.Fatalf("expected source url in ffmpeg args:\n%v", args)
	}
}

func TestTranscodeAudioSourceTerminatesFFmpegOnCancel(t *testing.T) {
	commander := &fakeFFmpegCommander{}
	src := NewTranscodeAudioSource("rtsp://fake/cam", commander, discardLogger())

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- src.ReadRTP(ctx, func(*rtp.Packet) {}) }()

	// Give Start a moment to run before cancelling.
	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("ReadRTP returned error after cancel: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("ReadRTP did not return after cancel (ffmpeg process leak)")
	}
}
