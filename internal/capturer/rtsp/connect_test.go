package rtsp_test

import (
	"reflect"
	"testing"

	"camera/internal/capturer/rtsp"
)

// -rw_timeout foi adicionado na história feat/modulo-eventos-centralizado
// (incidente 2026-08-26: ffmpeg travado numa leitura RTSP nunca saía
// sozinho, deixando o recorder/HLS mudos por horas) — força o ffmpeg a
// sair quando a leitura trava, em vez de pendurar pra sempre.
func TestConnectArgs(t *testing.T) {
	t.Run("CA3: TransportArgs força RTSP sobre TCP com timeout de leitura", func(t *testing.T) {
		want := []string{"-rtsp_transport", "tcp", "-rw_timeout", "15000000"}
		if got := rtsp.TransportArgs(); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
	t.Run("CA3: ConnectArgs combina TransportArgs+core.InputArgs, nessa ordem", func(t *testing.T) {
		want := []string{"-rtsp_transport", "tcp", "-rw_timeout", "15000000", "-i", "rtsp://cam/stream"}
		if got := rtsp.ConnectArgs("rtsp://cam/stream"); !reflect.DeepEqual(got, want) {
			t.Errorf("got %v, want %v", got, want)
		}
	})
}
