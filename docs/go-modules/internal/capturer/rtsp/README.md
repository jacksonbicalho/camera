# internal/capturer/rtsp

Centraliza a captura de câmeras via RTSP — o protocolo de captura mais comum
do projeto (único até `capture_type` existir). Args/decisões que antes
estavam duplicadas entre `internal/recorder`, `internal/transmission/hls` e o
snapshot avulso de `cmd/camera` agora vivem aqui.

## Arquivos principais
- `connect.go` — `TransportArgs` (força RTSP sobre TCP, `-rtsp_transport tcp`
  — compartilhado por qualquer captura RTSP do projeto) e `ConnectArgs`
  (`TransportArgs` + `core.InputArgs`, o caso comum — usado por quem não
  precisa de flags extras de conexão, ex. recorder/snapshot; quem precisa de
  flags entre os dois, ex. streaming de baixa latência, compõe os dois
  diretamente em vez de usar `ConnectArgs`).
- `snapshot.go` — `Snapshot(ctx, url, executor)`: captura 1 frame JPEG do
  stream via `ConnectArgs` + flags de frame único, usando um
  `core.Executor` injetado (mesma interface de execução única do
  `internal/core`).

## Ver também
- [internal/capturer](../README.md) — visão geral do domínio de captura.
- [internal/capturer/hls](../hls/README.md) — protocolo irmão.
- [internal/core](../../core/README.md) — `TranscodeArgs`/`InputArgs`/`Executor`, a parte protocolo-agnóstica.
