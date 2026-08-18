// Package rtsp centraliza a captura de câmeras via RTSP — protocolo irmão de
// internal/capturer/hls, os 2 protocolos de captura de 1ª classe do projeto
// (o irmão MJPEG existiu até a história chore/remover-mjpeg-backend) — args/
// decisões compartilhadas entre internal/recorder e
// internal/transmission/hls. internal/motion (pipe
// contínuo de frames), internal/transmission/webrtc (WebRTC, via gortsplib) e
// internal/core/snapshot.go (captura de 1 frame JPEG) ficam fora de
// propósito — mecanismos de captura genuinamente diferentes (o último por
// restrição de import cycle: core não pode importar capturer/*), ver
// work_progress/analysis (história feat/capture-rtsp-dominio). Os pedaços
// protocolo-agnósticos (decisão de transcode, args de input, execução de
// comando) vivem em internal/core — ver work_progress/analysis (história
// feat/capture-hls-dominio).
package rtsp

import "camera/internal/core"

// TransportArgs monta o par de flags do ffmpeg que força RTSP sobre TCP —
// compartilhado por qualquer captura RTSP do projeto.
func TransportArgs() []string {
	return []string{"-rtsp_transport", "tcp"}
}

// ConnectArgs é o caso comum: TransportArgs + core.InputArgs, sem nada entre
// os dois — usado por quem não precisa de flags extras de conexão (recorder,
// snapshot). Quem precisa de flags extras entre os dois (ex.: streaming,
// baixa latência) compõe TransportArgs/core.InputArgs diretamente.
func ConnectArgs(url string) []string {
	return append(TransportArgs(), core.InputArgs(url)...)
}
