package motion

import (
	"reflect"
	"strconv"
	"testing"

	"camera/internal/capturer/mjpeg"
)

func TestFFmpegArgsCaptureType(t *testing.T) {
	t.Run("CA3: capture_type=hls omite -rtsp_transport tcp", func(t *testing.T) {
		args := ffmpegArgs("https://cam.example.com/stream/playlist.m3u8", 640, 360, 5, "hls")
		for i := 0; i < len(args)-1; i++ {
			if args[i] == "-rtsp_transport" {
				t.Fatalf("capture_type=hls não deve emitir -rtsp_transport, got args %v", args)
			}
		}
		if args[0] != "-i" || args[1] != "https://cam.example.com/stream/playlist.m3u8" {
			t.Errorf("expected -i <url> at the start of args, got %v", args)
		}
	})

	t.Run("CA3: capture_type default (rtsp) preserva -rtsp_transport tcp", func(t *testing.T) {
		want := []string{"-rtsp_transport", "tcp", "-i", "rtsp://192.168.1.10:554/stream"}
		got := ffmpegArgs("rtsp://192.168.1.10:554/stream", 640, 360, 5, "rtsp")
		if !reflect.DeepEqual(got[:4], want) {
			t.Errorf("got %v, want prefix %v", got, want)
		}
	})

	// --- capture_type=mjpeg (história feat/capture-mjpeg) ---

	t.Run("CA2: capture_type=mjpeg omite -rtsp_transport tcp, mesmo tratamento que hls", func(t *testing.T) {
		args := ffmpegArgs("https://195.196.36.242/mjpg/video.mjpg", 640, 360, 5, "mjpeg")
		for i := 0; i < len(args)-1; i++ {
			if args[i] == "-rtsp_transport" {
				t.Fatalf("capture_type=mjpeg não deve emitir -rtsp_transport, got args %v", args)
			}
		}
	})

	// --- timeout de leitura de rede pra MJPEG (história fix/mjpeg-read-timeout) ---

	t.Run("CA3: capture_type=mjpeg inclui -rw_timeout (mjpeg.ReadTimeout) antes de -i <url>", func(t *testing.T) {
		want := []string{
			"-rw_timeout", strconv.FormatInt(mjpeg.ReadTimeout.Microseconds(), 10),
			"-i", "https://195.196.36.242/mjpg/video.mjpg",
		}
		got := ffmpegArgs("https://195.196.36.242/mjpg/video.mjpg", 640, 360, 5, "mjpeg")
		if !reflect.DeepEqual(got[:4], want) {
			t.Errorf("got %v, want prefix %v", got, want)
		}
	})

	t.Run("CA4: capture_type hls/rtsp/default NAO ganham -rw_timeout (desacoplamento do fix de MJPEG)", func(t *testing.T) {
		for _, ct := range []string{"hls", "rtsp", ""} {
			args := ffmpegArgs("url", 640, 360, 5, ct)
			for _, a := range args {
				if a == "-rw_timeout" {
					t.Errorf("capture_type=%q não deveria ter -rw_timeout, got args %v", ct, args)
				}
			}
		}
	})
}
