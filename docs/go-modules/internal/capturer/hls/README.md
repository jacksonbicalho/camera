# internal/capturer/hls

Centraliza a captura de câmeras cuja fonte é um stream HLS (playlist `.m3u8`
servida via HTTP/HTTPS) — protocolo irmão de `internal/capturer/rtsp`, mesmo
padrão: o núcleo protocolo-agnóstico vive em `internal/core`, aqui só o que é
específico de HLS.

## Arquivos principais
- `connect.go` — `ConnectArgs(url)`: ao contrário do RTSP, HLS é servido
  sobre HTTP simples e não tem flag de transporte equivalente a
  `-rtsp_transport tcp` pra forçar — `core.InputArgs` (`-i <url>`) já basta.

## Ver também
- [internal/capturer](../README.md) — visão geral do domínio de captura.
- [internal/capturer/rtsp](../rtsp/README.md) — protocolo irmão.
- [internal/core](../../core/README.md) — a parte protocolo-agnóstica.
