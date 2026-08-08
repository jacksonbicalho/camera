// Package rtsp centraliza a captura de câmeras via RTSP (o único protocolo de
// captura do projeto hoje) — args/decisões que hoje estão duplicadas entre
// internal/recorder, internal/transmission/hls e o snapshot avulso de cmd/camera.
// internal/motion (pipe contínuo de frames) e internal/transmission/webrtc
// (WebRTC, via gortsplib) ficam fora de propósito — mecanismos de captura genuinamente
// diferentes, ver work_progress/analysis (história feat/capture-rtsp-dominio).
// Os pedaços protocolo-agnósticos (decisão de transcode, args de input,
// execução de comando) vivem em internal/core — ver work_progress/analysis
// (história feat/capture-hls-dominio).
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
