# internal/transmission

Domínio de entrega do vídeo ao vivo pro browser — irmão, do lado servidor, de
`internal/capture/` (história `refactor/transmission-dominio`). Não tem `.go`
próprio — só agrupa os dois transportes abaixo, que coexistem por design
(`auto` tenta os dois, um por câmera pode forçar um ou outro via
`live_transport`).

## Subpacotes
- [hls](hls/README.md) — segmentos HLS, compatibilidade universal, piso de ~5-6s de latência.
- [webrtc](webrtc/README.md) — baixa latência (sub-segundo), só câmeras H.264.

## Ver também
- [internal/capture](../capture/README.md) — domínio irmão do lado da captura.
- [internal/recorder](../recorder/README.md) — terceiro consumidor do stream da câmera, gravação (não entrega ao vivo).
