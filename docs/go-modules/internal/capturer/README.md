# internal/capturer

Domínio de captura de câmera: builders de argumentos ffmpeg específicos por
protocolo, compartilhados por qualquer consumidor que precise se conectar a
uma câmera (`internal/recorder`, `internal/transmission/hls`,
`internal/motion`'s snapshot avulso). Não tem `.go` próprio — só agrupa os
subpacotes abaixo, um por protocolo.

Os pedaços protocolo-agnósticos (decisão de transcode, args de input, execução
de comando) vivem em `internal/core` — irmão, nunca aninhado aqui — porque
deixaram de ser exclusividade de um protocolo (nasceu quando
`internal/capturer/rtsp` deixou de ser o único consumidor real desses
símbolos).

`internal/motion` (pipe contínuo de frames) e `internal/transmission/webrtc`
(RTP via `gortsplib`) ficam **fora** deste domínio de propósito — mecanismos
de captura genuinamente diferentes dos dois protocolos abaixo (história
`feat/capture-rtsp-dominio`).

## Subpacotes
- [rtsp](rtsp/README.md) — o protocolo de captura mais comum (única opção até `capture_type` existir).
- [hls](hls/README.md) — câmeras cuja fonte já é uma playlist HLS remota.

## Ver também
- [internal/core](../core/README.md) — utilitários protocolo-agnósticos consumidos pelos dois.
- [internal/recorder](../recorder/README.md), [internal/transmission/hls](../transmission/hls/README.md) — consumidores primários.
