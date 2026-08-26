# internal/transmission/hls

Gera a playlist HLS ao vivo em `{segments_path}/{camera_id}/index.m3u8`.
Transporte universal (qualquer browser toca HLS), com piso de latência de
~5-6s — alternativa mais compatível ao `internal/transmission/webrtc`
(sub-segundo, mas só H.264).

## Arquivos principais
- `streamer.go` — `HLSStreamer`/`NewHLSStreamer`. `Start` monta os args nesta
  ordem: `rtsp.TransportArgs()` primeiro quando a captura é RTSP (força TCP —
  não se aplica a captura HLS), depois as flags de baixa latência
  (`-fflags +nobuffer -flags +low_delay`), depois `ConnectArgs`/`InputArgs`
  do protocolo de captura da câmera, `core.TranscodeArgs`, e por fim `-f hls`
  com `-hls_time`/`-hls_list_size`/`-hls_flags` — e sobe via `exec.Commander`.
  `hlsListSizeAndFlags` decide entre dois modos: **padrão** (janela de N
  segmentos, `delete_segments+append_list+independent_segments` — descarta os
  antigos) e **DVR** (quando `camera.hls_dvr_seconds > 0`: mantém todos os
  segmentos da janela DVR, sem `delete_segments`, e adiciona
  `program_date_time` pra permitir seek por timestamp). `Run` é o loop de
  reconexão padrão (sem o rollover de meia-noite do `internal/recorder` — HLS
  não tem diretório por dia). `WithEvents(bus)` injeta um `*events.Bus`
  opcional (zero value `nil` seguro, publish vira no-op), mesmo padrão do
  `internal/recorder` — `Run` publica `EventStopped`
  (`"transmission.stopped"`) na saída inesperada do processo e
  `EventRecovered` (`"transmission.recovered"`) quando o `Start()` seguinte
  tem sucesso.

## Decisões e invariantes
- Reaproveita o mesmo `-timeout` de `rtsp.TransportArgs()` que o
  `internal/recorder` usa — sem isso o `ffmpeg` bloqueado numa leitura RTSP
  travada nunca sai sozinho e o loop de reconexão deste `Run` não é
  acionado. Não precisou de mudança própria: já vinha de `TransportArgs()`
  chamado direto em `Start()`, então a correção de `-rw_timeout` (não
  aceito pelo demuxer RTSP) pra `-timeout` em `TransportArgs()` bastou. Ver
  [internal/capturer/rtsp](../../capturer/rtsp/README.md).
- Usa `time.Now()` direto (não um campo `now` injetável como o
  `internal/recorder`) — este pacote não tem rollover diário, então injetar
  tempo só para os eventos seria abstração prematura sem segundo caso de
  uso.

## Ver também
- [internal/transmission](../README.md) — visão geral do domínio de entrega ao vivo.
- [internal/transmission/webrtc](../webrtc/README.md) — transporte irmão, baixa latência.
- [internal/capturer](../../capturer/README.md) — builders de args por protocolo de captura.
- [internal/capturer/rtsp](../../capturer/rtsp/README.md) — `StallTimeout`/`-timeout`.
- [internal/events](../../events/README.md) — barramento onde `EventStopped`/`EventRecovered` são publicados.
- [internal/alerts](../../alerts/README.md) — assina esses eventos e vira notificação pra admins.
