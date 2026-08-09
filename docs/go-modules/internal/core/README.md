# internal/core

Utilitários de captura genéricos o bastante pra serem compartilhados por mais de
um protocolo (não específicos de RTSP, HLS, etc.) — irmão de `internal/capture/`,
nunca aninhado dentro dele (`internal/exec` e `internal/ffprobe` já seguem esse
mesmo padrão: topo, não aninhados em nada de protocolo). Nasceu quando
`internal/capture/rtsp` deixou de ser o único consumidor real desses símbolos
(história `feat/capture-hls-dominio`).

Também define `Executor`, a interface injetável usada por chamadas ffmpeg
avulsas (ex. snapshot) que só precisam do stdout capturado — diferente de
`internal/exec.Commander`, que gerencia processos de longa duração.

## Arquivos principais
- `args.go` — `InputArgs` (`-i <url>`), `NeedsTranscode` (decide se o stream
  precisa virar H.264, dado o modo do consumidor — `h264` sempre, `copy` nunca,
  `auto`/vazio só quando o codec detectado não é h264) e `TranscodeArgs` (monta
  as flags de vídeo/áudio pro caminho de transcode ou stream copy).
- `exec.go` — `Executor` (interface) + `OSExecutor` (implementação real via
  `os/exec`, usada pra comandos ffmpeg de execução única como snapshot).

## Ver também
- [internal/capture](../capture/README.md) e seus subpacotes (`rtsp`/`hls`) — consumidores primários.
- [internal/exec](../exec/README.md) — irmão pra processos de longa duração (em vez de execução única).
