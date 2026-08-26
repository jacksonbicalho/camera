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

import (
	"strconv"
	"time"

	"camera/internal/core"
)

// StallTimeout limita quanto tempo o ffmpeg fica bloqueado numa leitura RTSP
// travada antes de sair sozinho — sem isso, uma queda de rede no meio de uma
// leitura deixa o processo pendurado indefinidamente, sem produzir saída e
// sem sair, então o loop de reconexão de quem o supervisiona (Recorder.Run,
// HLSStreamer.Run) nunca é acionado (incidente 2026-08-26: ~8h sem gravar
// depois de um blip de rede de poucos minutos). Curto o bastante pra não
// deixar a câmera muda por horas, longo o bastante pra não reiniciar à toa
// num blip de rede normal.
const StallTimeout = 15 * time.Second

// TransportArgs monta as flags do ffmpeg que forçam RTSP sobre TCP com
// timeout de leitura (StallTimeout) — compartilhado por qualquer captura
// RTSP do projeto. `-timeout`, não `-rw_timeout`: essa última existe em
// `ffmpeg -h full` (opção genérica de protocolo), mas o demuxer RTSP não a
// aceita de verdade — ffmpeg sai na hora com "Option rw_timeout not found"
// e nunca conecta (confirmado contra ffmpeg 8.1.2, a mesma versão do
// Dockerfile do projeto — quebrou recorder/HLS de qualquer instalação por
// algumas horas no dia em que a flag errada foi introduzida). `-timeout` é
// o nome certo pro demuxer RTSP: confirmado conectando normalmente contra
// uma câmera real e saindo no tempo certo (segundos, não min) contra um
// host inalcançável.
func TransportArgs() []string {
	return []string{
		"-rtsp_transport", "tcp",
		"-timeout", strconv.FormatInt(StallTimeout.Microseconds(), 10),
	}
}

// ConnectArgs é o caso comum: TransportArgs + core.InputArgs, sem nada entre
// os dois — usado por quem não precisa de flags extras de conexão (recorder,
// snapshot). Quem precisa de flags extras entre os dois (ex.: streaming,
// baixa latência) compõe TransportArgs/core.InputArgs diretamente.
func ConnectArgs(url string) []string {
	return append(TransportArgs(), core.InputArgs(url)...)
}
