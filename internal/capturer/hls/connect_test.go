package hls_test

import (
	"reflect"
	"testing"

	"camera/internal/capturer/hls"
)

func TestConnectArgs(t *testing.T) {
	t.Run("CA2: ConnectArgs monta -i <url> sem -rtsp_transport tcp (HLS é HTTP simples, não RTSP)", func(t *testing.T) {
		want := []string{"-i", "https://cam.example.com/stream/playlist.m3u8"}
		got := hls.ConnectArgs("https://cam.example.com/stream/playlist.m3u8")
		if !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
}
