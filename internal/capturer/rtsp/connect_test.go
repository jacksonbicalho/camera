package rtsp_test

import (
	"reflect"
	"testing"

	"camera/internal/capturer/rtsp"
)

func TestConnectArgs(t *testing.T) {
	t.Run("CA3: TransportArgs força RTSP sobre TCP", func(t *testing.T) {
		want := []string{"-rtsp_transport", "tcp"}
		if got := rtsp.TransportArgs(); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA3: ConnectArgs combina TransportArgs+core.InputArgs, nessa ordem", func(t *testing.T) {
		want := []string{"-rtsp_transport", "tcp", "-i", "rtsp://cam/stream"}
		if got := rtsp.ConnectArgs("rtsp://cam/stream"); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
}
