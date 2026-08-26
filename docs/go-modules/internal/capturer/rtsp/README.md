# internal/capturer/rtsp

Centraliza a captura de câmeras via RTSP — o protocolo de captura mais comum
do projeto (único até `capture_type` existir). Args/decisões que antes
estavam duplicadas entre `internal/recorder`, `internal/transmission/hls` e o
snapshot avulso de `cmd/camera` agora vivem aqui.

## Arquivos principais
- `connect.go` — `TransportArgs` (força RTSP sobre TCP, `-rtsp_transport tcp`,
  e limita o tempo de leitura travada com `-timeout
  <StallTimeout.Microseconds()>` — compartilhado por qualquer captura RTSP
  do projeto) e `ConnectArgs` (`TransportArgs` + `core.InputArgs`, o caso
  comum — usado por quem não precisa de flags extras de conexão, ex.
  recorder/snapshot; quem precisa de flags entre os dois, ex. streaming de
  baixa latência, compõe os dois diretamente em vez de usar `ConnectArgs`).
- `snapshot.go` — `Snapshot(ctx, url, executor)`: captura 1 frame JPEG do
  stream via `ConnectArgs` + flags de frame único, usando um
  `core.Executor` injetado (mesma interface de execução única do
  `internal/core`).

## Decisões e invariantes
- `StallTimeout = 15 * time.Second` (constante em `connect.go`) é o que
  faz um `ffmpeg` bloqueado numa leitura RTSP sair sozinho em vez de ficar
  pendurado indefinidamente — sem saída de vídeo e sem sair do processo,
  então nenhum supervisor externo (`Recorder.Run`, `HLSStreamer.Run`)
  percebe a queda (incidente 2026-08-26: ~8h sem gravar depois de um blip
  de rede de poucos minutos). 15s foi escolhido como meio-termo: curto o
  bastante pra não deixar a câmera muda por horas, longo o bastante pra não
  reiniciar à toa num blip de rede normal. `webrtc.Publisher` nunca teve
  esse problema — não usa ffmpeg pra ler vídeo, lê RTP direto em Go com
  timeout próprio.
- A flag certa é `-timeout`, não `-rw_timeout`: essa última chegou a ser
  usada por algumas horas no mesmo dia do incidente acima, mas o demuxer
  RTSP do ffmpeg não a aceita (`Option rw_timeout not found`, apesar de
  existir em `ffmpeg -h full` como opção genérica de protocolo) — quebrava
  recorder/HLS de qualquer instalação. Corrigido e confirmado contra ffmpeg
  8.1.2 (mesma versão do `Dockerfile` do projeto).

## Ver também
- [internal/capturer](../README.md) — visão geral do domínio de captura.
- [internal/capturer/hls](../hls/README.md) — protocolo irmão.
- [internal/core](../../core/README.md) — `TranscodeArgs`/`InputArgs`/`Executor`, a parte protocolo-agnóstica.
- [internal/recorder](../../recorder/README.md) — consome `ConnectArgs` (via `TransportArgs`) e depende do `-timeout` pro loop de reconexão funcionar.
- [internal/transmission/hls](../../transmission/hls/README.md) — consome `TransportArgs` direto, mesma dependência do `-timeout`.
