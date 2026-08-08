package rtsp_test

import (
	"reflect"
	"testing"

	"camera/internal/capture/rtsp"
)

func TestNeedsTranscode(t *testing.T) {
	t.Run("CA2: modo h264 sempre transcodifica, independente do codec detectado", func(t *testing.T) {
		if !rtsp.NeedsTranscode("h264", "h264") {
			t.Error("h264+h264: esperava true")
		}
		if !rtsp.NeedsTranscode("h264", "") {
			t.Error("h264+vazio: esperava true")
		}
	})
	t.Run("CA2: modo copy nunca transcodifica, independente do codec", func(t *testing.T) {
		if rtsp.NeedsTranscode("copy", "hevc") {
			t.Error("copy+hevc: esperava false")
		}
	})
	t.Run("CA2: modo auto (ou vazio) transcodifica só quando o codec detectado não é h264", func(t *testing.T) {
		if rtsp.NeedsTranscode("auto", "h264") {
			t.Error("auto+h264: esperava false (copy)")
		}
		if !rtsp.NeedsTranscode("auto", "hevc") {
			t.Error("auto+hevc: esperava true (transcode)")
		}
		if rtsp.NeedsTranscode("", "") {
			t.Error("vazio+vazio (codec desconhecido): esperava false, mesma regra de hoje")
		}
	})
}

func TestConnectArgs(t *testing.T) {
	t.Run("CA3: TransportArgs força RTSP sobre TCP", func(t *testing.T) {
		want := []string{"-rtsp_transport", "tcp"}
		if got := rtsp.TransportArgs(); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA3: InputArgs monta -i <url>", func(t *testing.T) {
		want := []string{"-i", "rtsp://cam/stream"}
		if got := rtsp.InputArgs("rtsp://cam/stream"); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA3: ConnectArgs combina TransportArgs+InputArgs, nessa ordem", func(t *testing.T) {
		want := []string{"-rtsp_transport", "tcp", "-i", "rtsp://cam/stream"}
		if got := rtsp.ConnectArgs("rtsp://cam/stream"); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
}

func TestTranscodeArgs(t *testing.T) {
	t.Run("CA3: transcode com áudio usa libx264 ultrafast/zerolatency + copy de áudio", func(t *testing.T) {
		want := []string{"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-c:a", "copy"}
		if got := rtsp.TranscodeArgs(true, true); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA3: transcode sem áudio adiciona -an", func(t *testing.T) {
		want := []string{"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-an"}
		if got := rtsp.TranscodeArgs(true, false); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA3: copy com áudio não mexe no áudio (-c copy sozinho já cobre)", func(t *testing.T) {
		want := []string{"-c", "copy"}
		if got := rtsp.TranscodeArgs(false, true); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA3: copy sem áudio adiciona -an", func(t *testing.T) {
		want := []string{"-c", "copy", "-an"}
		if got := rtsp.TranscodeArgs(false, false); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
}
