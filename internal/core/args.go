// Package core reúne utilitários de captura genéricos o bastante pra serem
// compartilhados por mais de um protocolo (não específicos de RTSP, HLS,
// etc.) — irmão de internal/capture/, nunca aninhado dentro dele
// (internal/exec e internal/ffprobe já seguem esse mesmo padrão: topo, não
// aninhados em nada de protocolo). Nasceu quando internal/capture/rtsp
// deixou de ser o único consumidor real desses símbolos — ver
// work_progress/analysis (história feat/capture-hls-dominio).
package core

// InputArgs monta o par de flags "-i <url>" do ffmpeg.
func InputArgs(url string) []string {
	return []string{"-i", url}
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
// transcode (libx264 ultrafast/zerolatency) ou stream copy.
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
