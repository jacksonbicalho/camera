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
  não tem diretório por dia).

## Ver também
- [internal/transmission](../README.md) — visão geral do domínio de entrega ao vivo.
- [internal/transmission/webrtc](../webrtc/README.md) — transporte irmão, baixa latência.
- [internal/capture](../../capture/README.md) — builders de args por protocolo de captura.
