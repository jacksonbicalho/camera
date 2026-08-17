package mjpeg_test

import (
	"reflect"
	"strconv"
	"testing"

	"camera/internal/capturer/mjpeg"
)

func TestConnectArgs(t *testing.T) {
	t.Run("CA2: ConnectArgs inclui -rw_timeout (mjpeg.ReadTimeout) antes de -i <url>, sem -rtsp_transport tcp", func(t *testing.T) {
		want := []string{
			"-rw_timeout", strconv.FormatInt(mjpeg.ReadTimeout.Microseconds(), 10),
			"-i", "https://195.196.36.242/mjpg/video.mjpg",
		}
		got := mjpeg.ConnectArgs("https://195.196.36.242/mjpg/video.mjpg")
		if !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
}
