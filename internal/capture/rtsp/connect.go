// Package rtsp centraliza a captura de câmeras via RTSP (o único protocolo de
// captura do projeto hoje) — args/decisões que hoje estão duplicadas entre
// internal/recorder, internal/streaming e o snapshot avulso de cmd/camera.
// internal/motion (pipe contínuo de frames) e internal/live (WebRTC, via
// gortsplib) ficam fora de propósito — mecanismos de captura genuinamente
// diferentes, ver work_progress/analysis (história feat/capture-rtsp-dominio).
package rtsp

// TransportArgs monta o par de flags do ffmpeg que força RTSP sobre TCP —
// compartilhado por qualquer captura RTSP do projeto.
func TransportArgs() []string {
	return []string{"-rtsp_transport", "tcp"}
}

// InputArgs monta o par de flags "-i <url>".
func InputArgs(url string) []string {
	return []string{"-i", url}
}

// ConnectArgs é o caso comum: TransportArgs + InputArgs, sem nada entre os
// dois — usado por quem não precisa de flags extras de conexão (recorder,
// snapshot). Quem precisa de flags extras entre os dois (ex.: streaming,
// baixa latência) compõe TransportArgs/InputArgs diretamente.
func ConnectArgs(url string) []string {
	return append(TransportArgs(), InputArgs(url)...)
}

// NeedsTranscode decide se o stream precisa ser transcodificado pra H.264,
// dada a preferência de modo do consumidor ("h264" sempre transcodifica,
// "copy" nunca, "auto"/vazio só quando o codec detectado não é h264).
func NeedsTranscode(mode, streamCodec string) bool {
	switch mode {
	case "h264":
		return true
	case "copy":
		return false
	default: // "auto" ou vazio
		return streamCodec != "" && streamCodec != "h264"
	}
}

// TranscodeArgs monta as flags de vídeo/áudio do ffmpeg pro caminho de
// transcode (libx264 ultrafast/zerolatency) ou stream copy — a mesma decisão
// que recorder/streaming faziam cada um por conta própria.
func TranscodeArgs(needsTranscode, hasAudio bool) []string {
	if needsTranscode {
		args := []string{"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency"}
		if hasAudio {
			return append(args, "-c:a", "copy")
		}
		return append(args, "-an")
	}
	args := []string{"-c", "copy"}
	if !hasAudio {
		args = append(args, "-an")
	}
	return args
}
