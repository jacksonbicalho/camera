// Package mjpeg centraliza a captura de câmeras cuja fonte é um stream MJPEG
// (multipart/x-mixed-replace servido via HTTP/HTTPS) — protocolo irmão de
// internal/capturer/rtsp e internal/capturer/hls, mesmo padrão: o núcleo
// protocolo-agnóstico (decisão de transcode, args de input, execução de
// comando) vive em internal/core, aqui só o que é específico de MJPEG. Ver
// work_progress/analysis (história feat/capture-mjpeg).
//
// internal/core/snapshot.go (captura de 1 frame JPEG) não usa este pacote —
// nem os irmãos rtsp/hls: ele mora em internal/core, e core importar
// capturer/mjpeg de volta seria um import cycle (capturer/mjpeg já importa
// core). core.Snapshot decide a flag de transporte direto via
// core.NeedsRTSPTransport, protocolo-agnóstico por construção.
package mjpeg

import "camera/internal/core"

// ConnectArgs monta os args ffmpeg pra ler um stream MJPEG remoto — ao
// contrário do RTSP, MJPEG é servido sobre HTTP simples e não tem flag de
// transporte equivalente a "-rtsp_transport tcp" pra forçar; core.InputArgs
// (-i <url>) já basta.
func ConnectArgs(url string) []string {
	return core.InputArgs(url)
}
