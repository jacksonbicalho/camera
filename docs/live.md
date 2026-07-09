# Transmissão ao vivo

Cada câmera habilitada tem uma transmissão ao vivo, exibida na página `/live/:cameraId`
(acessada pelo grid de "Todas as câmeras" ou pelas abas Ao vivo/Histórico no topo da
página da câmera).

---

## Como funciona

O ao-vivo é **WebRTC-first com fallback automático para HLS**:

- **WebRTC** — o servidor repacota o RTP do stream RTSP (H.264, sem transcode) e entrega
  direto pro navegador via `PeerConnection`, com latência sub-segundo. Exige codec H.264
  no stream principal.
- **HLS** — quando o WebRTC não está disponível (codec não-H.264, negociação falha, ou a
  conexão não fecha em alguns segundos), o player cai automaticamente pro streaming HLS
  tradicional: um processo `ffmpeg` lê o RTSP e escreve segmentos (`{segments_path}/{camera_id}/`,
  playlist `index.m3u8` + segmentos `NNNNNN.ts`, padrão 2 s cada) que o navegador reproduz
  com `hls.js`. Tem um piso de latência maior (alguns segundos) que o WebRTC.

O campo **Transporte do ao-vivo** (`auto`/`webrtc`/`hls`, no formulário da câmera — ver
`docs/cameras.md`) controla essa escolha por câmera: `auto` tenta WebRTC com fallback pro
HLS (padrão); `webrtc` força só WebRTC (câmeras não-H.264 caem pro HLS mesmo assim, já que
o navegador não decodifica H.265 via WebRTC); `hls` força só HLS, sem tentar WebRTC.

Quando o codec do stream HLS não é compatível com o navegador, o servidor transcodifica
para H.264 (configurável por câmera em **Modo de vídeo HLS**).

### Modo DVR

Com **Retenção DVR** `> 0`, a janela HLS mantém vários minutos/horas de segmentos e
adiciona `EXT-X-PROGRAM-DATE-TIME` (permitindo seek por timestamp). Esse modo é sobre o
pipeline HLS — não se aplica ao transporte WebRTC.

---

## Controles do player

Ao vivo (`/live/:cameraId`): zoom digital (arrastar para deslocar a imagem ampliada,
scroll/pinch pra ampliar) e tela cheia. Sem controle de mudo nem seletor de velocidade
nessa tela — o vídeo ao vivo é sempre mudo (necessário pro autoplay do navegador sem
interação do usuário).

Quando a câmera está sem sinal, a live não fica "fingindo" transmissão antiga: o player
detecta a falha (WebRTC ou HLS) e tenta reconectar automaticamente com backoff.

---

## Reprodução de gravações

O histórico de gravações da câmera (calendário, tira de cards, reprodução contínua) tem
página própria — ver **[docs/history.md](history.md)**.

**Reprodução de um clipe** (`/recording/:cameraId/:recordingId`, chegada a partir de um
card do Histórico ou de um evento) — barra de controles própria (não-nativa): progresso,
play/pause, tempo, mudo e tela cheia. Ao clicar num evento de movimento, o clipe é montado
automaticamente em torno do momento do evento (alguns segundos antes/depois).

A transição entre gravações consecutivas usa dois `<video>` empilhados (double-buffering):
enquanto um toca, o outro pré-carrega o próximo trecho — sem tela preta piscando na
fronteira entre chunks.
