// Package hls centraliza a captura de câmeras cuja fonte é um stream HLS
// (playlist .m3u8 servida via HTTP/HTTPS) — protocolo irmão de
// internal/capture/rtsp, mesmo padrão: o núcleo protocolo-agnóstico
// (decisão de transcode, args de input, execução de comando) vive em
// internal/core, aqui só o que é específico de HLS. Ver
// work_progress/analysis (história feat/hls-capture-fundacao).
package hls

import "camera/internal/core"

// ConnectArgs monta os args ffmpeg pra ler uma playlist HLS remota — ao
// contrário do RTSP, HLS é servido sobre HTTP simples e não tem flag de
// transporte equivalente a "-rtsp_transport tcp" pra forçar; core.InputArgs
// (-i <url>) já basta.
func ConnectArgs(url string) []string {
	return core.InputArgs(url)
}
