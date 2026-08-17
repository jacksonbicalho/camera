# internal/motion

Detecta movimento via um pipe ffmpeg contínuo de frames raw — mecanismo de
captura genuinamente diferente de `internal/capturer` (por isso fica fora
daquele domínio, história `feat/capture-rtsp-dominio`). O pipe entrega frames
**RGB full-res**; cada frame é reduzido a cinza na resolução de diff
(`downscaleRGBToGray`, default 1/4) em memória, enquanto o frame full-res
original é mantido pro snapshot do evento.

## Arquivos principais
- `motion.go` — `Monitor`/`New`: monta o `detector` com a resolução de diff
  (explícita via `MotionConfig.CaptureWidth/Height` ou 1/4 do stream) e expõe
  `Events()` (eventos acima do limiar) e `RawScores()` (score bruto de cada
  frame, usado pelo gráfico em tempo real). `RegisterInspector`/`UnregisterInspector`
  dão o score de uma bbox arbitrária por frame (usado pelo canvas de zonas).
- `ffmpeg.go`/`ffmpeg_unix.go`/`ffmpeg_windows.go` — monta os args do pipe
  (`-vf fps=N,scale=W:H,format=rgb24 -f rawvideo pipe:1`) e o processo por
  plataforma. Para `capture_type=mjpeg`, acrescenta `-rw_timeout` (em
  microssegundos) antes de `-i url`, com o mesmo valor de
  `mjpeg.ReadTimeout` (`internal/capturer/mjpeg`) — MJPEG é HTTP contínuo
  (`multipart/x-mixed-replace`), sem heartbeat como o RTSP tem via RTCP:
  sem esse timeout, se a câmera para de mandar frames sem fechar o socket
  TCP, o processo ffmpeg do pipe fica pendurado pra sempre e o
  `reconnect_interval` (que só age depois que o processo morre) nunca
  chega a ser acionado. `hls`/`rtsp`/default não ganham a flag.
- `detector.go` — `processFrames`: lê frames full-res até EOF/cancelamento,
  faz o diff em cinza contra o frame anterior, e grava um evento quando o
  score cruza o limiar (com cooldown). `saveSnapshot` anota o **próprio frame
  que disparou** o evento (não um grab RTSP assíncrono posterior — por isso o
  bbox sempre bate com o sujeito). Zonas "detect" (`evaluateDetectZones`) são
  avaliadas independentemente do diff global, cada uma com seu próprio
  limiar/cooldown/FPS.
- `diff.go` — `BBox`, `diffFramesMasked`/`diffFramesForZone` (diff mascarado
  por zonas de exclusão), `computeBBox`/`computeBBoxInZone` (localiza o objeto
  por subtração de fundo — `bg` é o modelo de fundo, atualizado só quando
  ocioso pra não absorver objetos em movimento).
- `annotate.go` — desenha a bbox/score no JPEG do evento (`annotateRGBFrame`)
  e codifica o frame limpo (`encodeRGBToJPEG`, usado pelo carrossel de
  gravações) — implementação própria de linhas/texto, sem depender de uma lib
  de imagem externa.
- `store.go` — persiste o JPEG do evento em disco e registra a linha em
  `motion_events` via o callback `onEvent` (o `.ndjson` legado não é mais
  escrito, só lido como fallback).

**Substream de motion**: a URL RTSP que o pipe decodifica é
`cam.EffectiveMotionURL()` (`internal/config`) — o campo opcional
`cameras.motion_rtsp_url` quando preenchido (ex.: apontar pro substream
`subtype=1` de uma Dahua/Intelbras corta o custo de decode em ~6-9×), senão a
`rtsp_url` principal (recorder/HLS sempre usam a principal). Quando a URL de
motion difere da principal, `main.go` faz um `ffprobe.Resolve` dela pro
`Monitor` usar as dimensões reais no pipe/snapshot — trade-off: o JPEG do
evento sai na resolução do stream de motion (menor se for substream). O botão
"Detectar" do form de câmera chama `POST /api/settings/cameras/detect-substream`
(admin): deriva candidatos por convenção (`subtype=0`→`subtype=1`), roda
`ffprobe.Resolve` em cada um e devolve o primeiro que responder.

## Decisões e invariantes
- `ffmpeg.go` importa `internal/capturer/mjpeg` só pelo **valor** da
  constante `ReadTimeout`, nunca chama `mjpeg.ConnectArgs` — `motion` monta
  seus próprios args do pipe (`-vf`/`-f rawvideo`/etc.) de forma
  independente dos protocolos de captura "de alto nível" (mesma razão de
  `feat/capture-rtsp-dominio` já descrita acima); compartilhar o número
  evita duplicar o valor do timeout sem reintroduzir esse acoplamento
  (mesmo tipo de dependência-só-de-valor que já existe com
  `core.NeedsRTSPTransport`).

## Ver também
- [internal/zones](../zones/README.md) — o tipo `Zone` consumido pelo diff mascarado.
- [internal/exec](../exec/README.md) — processo ffmpeg do pipe.
- [internal/config](../config/README.md) — `EffectiveMotionURL` e o `MotionConfig`.
- [internal/db](../db/README.md) — tabela `motion_events`.
- [internal/capturer](../capturer/README.md) — protocolos de captura "de alto nível" (rtsp/hls); `internal/capturer/mjpeg` (subpacote irmão, sem README próprio ainda) expõe `ReadTimeout`, o valor compartilhado com este pacote.
