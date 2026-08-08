package motion

import (
	"reflect"
	"testing"
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
}
