# internal/ffprobe

Executa e parseia a saída JSON do `ffprobe` para detectar codec de vídeo,
presença de áudio e dimensões do stream de uma câmera — usado no cadastro
(`POST /api/settings/cameras/detect-streams`) e no boot de cada câmera
(`main.go`'s `startCameraProcs`, via `Resolve`).

## Arquivos principais
- `ffprobe.go` — `StreamInfo` (codec, áudio, largura, altura), `Parse` (JSON
  bruto → `StreamInfo`), `Prober`/`NewProber(exec)` (define seu próprio
  `Executor`/`OSExecutor` locais — mesma forma de `internal/core.Executor`,
  mas sem importá-lo; duck-typing deliberado, os dois pacotes ficam
  desacoplados — permite testar sem `ffprobe` real via um fake) e `Probe`
  (monta os args de sonda por `captureType`, RTSP ou HLS).
- `resolve.go` — `Resolver` (overrides explícitos de codec/áudio/dimensões) e
  `Resolve` (só sonda de verdade quando largura/altura estão zeradas —
  `"auto"` — depois aplica os overrides por cima; falha de `Probe`/`Parse`
  retorna cedo só com `HasAudio=true`, sem passar pelos overrides do
  `Resolver` — um `VideoCodec`/`Width`/`Height` explícito seria ignorado
  nesse caminho de erro; nunca bloqueia o boot da câmera).

## Ver também
- [internal/recorder](../recorder/README.md), [internal/transmission/webrtc](../transmission/webrtc/README.md) — consomem `StreamInfo` pra decidir transcode/codec.
