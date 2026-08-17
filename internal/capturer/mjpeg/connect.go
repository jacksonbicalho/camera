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

import (
	"strconv"
	"time"

	"camera/internal/core"
)

// ReadTimeout é o timeout de leitura de rede aplicado à captura MJPEG via
// "-rw_timeout" (ffmpeg) — ver work_progress/analysis (história
// fix/mjpeg-read-timeout). MJPEG é HTTP contínuo
// (multipart/x-mixed-replace), sem nenhum mecanismo de heartbeat como o
// RTSP tem via RTCP: se a câmera para de mandar frames mas não fecha o
// socket TCP, o processo ffmpeg fica pendurado pra sempre sem esta flag —
// nenhum outro timeout de rede é configurado em lugar nenhum do projeto.
// Quando o timeout expira, o ffmpeg sai com erro, o que aciona o loop de
// reconexão já existente (recorder/streamer/motion, reconnect_interval) —
// sem a flag, o processo nunca morre sozinho e o reconnect_interval nunca
// chega a ser usado. Exportada (não só usada internamente por
// ConnectArgs) porque internal/motion monta sua própria captura MJPEG de
// forma independente (ver internal/motion/ffmpeg.go) e precisa do mesmo
// valor, sem depender de como ConnectArgs compõe o restante do pipeline.
const ReadTimeout = 15 * time.Second

// readTimeoutArgs monta a flag ffmpeg de timeout de leitura de rede a
// partir de ReadTimeout.
func readTimeoutArgs() []string {
	return []string{"-rw_timeout", strconv.FormatInt(ReadTimeout.Microseconds(), 10)}
}

// ConnectArgs monta os args ffmpeg pra ler um stream MJPEG remoto — ao
// contrário do RTSP, MJPEG é servido sobre HTTP simples e não tem flag de
// transporte equivalente a "-rtsp_transport tcp" pra forçar, mas precisa
// de um timeout de leitura (ReadTimeout) que o RTSP/HLS não têm hoje.
func ConnectArgs(url string) []string {
	return append(readTimeoutArgs(), core.InputArgs(url)...)
}
