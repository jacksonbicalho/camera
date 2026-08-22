# internal/recorder

Grava o stream RTSP/HLS de uma câmera em chunks MP4 **não fragmentados**
(stream copy quando possível — só transcodifica se `RecordVideoMode`/o codec
detectado exigirem). Armazena em
`{storage}/{camera_id}/{YYYY/MM/DD}/{YYYYMMDDHHmmss}.mp4`.

MP4 não fragmentado é uma escolha deliberada: fragmentado atrasa a escrita do
moov atom pro fim do arquivo, quebrando a duração/reprodução de um chunk lido
enquanto ainda está sendo gravado (ver `internal/server/server.go`,
`noCacheRecordings`) — não propor mudar isso sem revisitar essa decisão.

## Arquivos principais
- `recorder.go` — `Recorder`/`NewRecorder`. `Start` monta os args
  (`capture/rtsp` ou `capture/hls`'s `ConnectArgs` + `core.TranscodeArgs` +
  `-f segment` com `-segment_time`/`-strftime`) e sobe o processo via
  `exec.Commander`. `Run` é o loop de reconexão: além de reagir a
  `ctx.Done()`/saída inesperada do processo, agenda um **rollover** em
  `DurationUntilNextDay` — o ffmpeg congela o diretório do dia no padrão de
  saída ao iniciar (`-strftime` só expande o NOME do arquivo, não o
  diretório), então a sessão precisa reiniciar na virada da meia-noite UTC
  pra os chunks do novo dia caírem na pasta certa; esse restart pula o
  backoff de reconexão normal (é esperado, não uma falha). `Stop` termina o
  processo (parada graciosa via `internal/exec`, que fecha o MP4 corretamente
  antes de matar).

## Ver também
- [internal/capturer](../capturer/README.md) — builders de args por protocolo.
- [internal/exec](../exec/README.md) — gerência do processo ffmpeg de longa duração.
- [internal/storage](../storage/README.md) — retenção/limpeza dos chunks gravados aqui.
