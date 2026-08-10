# internal/transmission/webrtc

Entrega o ao-vivo de **baixa latência via WebRTC** (sub-segundo), alternativa
ao HLS (piso de ~5-6s). Um `Publisher` por câmera puxa RTP **H.264** direto de
uma sessão RTSP (via `gortsplib`, sem ffmpeg) e faz **repackage puro** — sem
decode/encode, CPU quase zero — pra uma única `TrackLocalStaticRTP`
compartilhada, encaminhando cada pacote a toda `PeerConnection` conectada.
**Só H.264** (browser não toca H.265 via WebRTC); câmeras não-H.264 não geram
`Publisher` e o front cai pro HLS.

## Arquivos principais
- `live.go` — `Source` (interface: `ReadRTP(ctx, onPacket) error` — injetável,
  testável sem câmera/rede), `Publisher`/`NewPublisher` (cria a track de
  vídeo e, quando `audioSource != nil`, uma 2ª track de áudio com o **mesmo
  streamID** — browsers agrupam tracks do mesmo stream num único
  `MediaStream`, então o `ontrack` do front pega os dois de uma vez). `Run`
  sobe uma goroutine por source (vídeo e áudio reconectam **independentemente**
  — um problema num não derruba o outro). `Negotiate` faz o handshake
  WHEP-style (offer→answer, ICE gather completo, sem trickle).
- `rtsp_source.go` — `ProbeAudio` (sessão RTSP curta, só `DESCRIBE`, classifica
  o áudio da SDP), `RTSPSource` (vídeo H.264, repackage puro) e
  `RTSPAudioSource` (áudio G.711 PCMA/PCMU, repackage puro — o único codec de
  áudio que câmeras IP comuns E browsers WebRTC compartilham nativamente,
  RFC 7874).
- `transcode_audio_source.go` — `TranscodeAudioSource`: quando o áudio não é
  G.711 (AAC é o caso comum), sobe um processo ffmpeg (`internal/exec`) que
  decodifica e reencoda pra Opus — o único caminho deste pacote que
  efetivamente transcodifica (vídeo e G.711 são puro repackage).
- `publish.go` — `ShouldPublish(videoCodec, transport, captureType, liveEnabled)`/
  `ShouldRunHLS(videoCodec, transport, captureType, liveEnabled)`: os dois
  lados do gating por câmera. `liveEnabled=false` desliga os dois
  incondicionalmente. Câmera com `captureType=="hls"` é um caso à parte:
  `ShouldPublish` retorna sempre `false` (o pipeline WebRTC fala RTSP direto
  via `gortsplib` — estruturalmente incompatível com uma fonte HLS) e
  `ShouldRunHLS` retorna sempre `true` (é o único mecanismo de entrega que
  funciona pra ela), **independente do valor de `live_transport`**. Fora
  desse caso (câmera RTSP), os 3 valores de `live_transport` têm efeito
  distinto: `auto` = os dois (WebRTC se H.264, HLS sempre como fallback);
  `webrtc` = só WebRTC quando H.264 (HLS desliga de vez, zero `.ts`; câmera
  RTSP não-H.264 em `webrtc` mantém HLS, já que o browser não a tocaria via
  WebRTC de qualquer forma); `hls` = só HLS.

## Ver também
- [internal/transmission](../README.md) — visão geral do domínio de entrega ao vivo.
- [internal/transmission/hls](../hls/README.md) — transporte irmão, fallback universal.
- [internal/ffprobe](../../ffprobe/README.md) — resolve o `VideoCodec` que `ShouldPublish`/`ShouldRunHLS` consultam.
