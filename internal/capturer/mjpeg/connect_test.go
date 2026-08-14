package mjpeg_test

import (
	"reflect"
	"testing"

	"camera/internal/capturer/mjpeg"
)

func TestConnectArgs(t *testing.T) {
	t.Run("CA2: ConnectArgs monta -i <url> sem -rtsp_transport tcp (MJPEG é HTTP simples, não RTSP)", func(t *testing.T) {
		want := []string{"-i", "https://195.196.36.242/mjpg/video.mjpg"}
		got := mjpeg.ConnectArgs("https://195.196.36.242/mjpg/video.mjpg")
		if !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
}
