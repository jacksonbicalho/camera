package core_test

import (
	"reflect"
	"testing"

	"camera/internal/core"
)

func TestInputArgs(t *testing.T) {
	t.Run("CA2: InputArgs monta -i <url>", func(t *testing.T) {
		want := []string{"-i", "https://cam/stream"}
		if got := core.InputArgs("https://cam/stream"); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
}

func TestNeedsTranscode(t *testing.T) {
	t.Run("CA2: modo h264 sempre transcodifica, independente do codec detectado", func(t *testing.T) {
		if !core.NeedsTranscode("h264", "h264") {
			t.Error("h264+h264: esperava true")
		}
		if !core.NeedsTranscode("h264", "") {
			t.Error("h264+vazio: esperava true")
		}
	})
	t.Run("CA2: modo copy nunca transcodifica, independente do codec", func(t *testing.T) {
		if core.NeedsTranscode("copy", "hevc") {
			t.Error("copy+hevc: esperava false")
		}
	})
	t.Run("CA2: modo auto (ou vazio) transcodifica só quando o codec detectado não é h264", func(t *testing.T) {
		if core.NeedsTranscode("auto", "h264") {
			t.Error("auto+h264: esperava false (copy)")
		}
		if !core.NeedsTranscode("auto", "hevc") {
			t.Error("auto+hevc: esperava true (transcode)")
		}
		if core.NeedsTranscode("", "") {
			t.Error("vazio+vazio (codec desconhecido): esperava false, mesma regra de hoje")
		}
	})
}

func TestTranscodeArgs(t *testing.T) {
	t.Run("CA2: transcode com áudio usa libx264 ultrafast/zerolatency + copy de áudio", func(t *testing.T) {
		want := []string{"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-c:a", "copy"}
		if got := core.TranscodeArgs(true, true); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA2: transcode sem áudio adiciona -an", func(t *testing.T) {
		want := []string{"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-an"}
		if got := core.TranscodeArgs(true, false); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA2: copy com áudio não mexe no áudio (-c copy sozinho já cobre)", func(t *testing.T) {
		want := []string{"-c", "copy"}
		if got := core.TranscodeArgs(false, true); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA2: copy sem áudio adiciona -an", func(t *testing.T) {
		want := []string{"-c", "copy", "-an"}
		if got := core.TranscodeArgs(false, false); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
}
