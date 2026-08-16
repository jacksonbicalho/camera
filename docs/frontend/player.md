# Player e reprodução de vídeo

Os dois motores de player do app (ao vivo e gravação) e os componentes que
eles compartilham.

## Arquivos principais

- `components/Player.tsx` (nome antigo `HLSPlayer`) — player de live enxuto,
  **WebRTC-first com fallback automático pro HLS**: tenta o transporte
  WebRTC de baixa latência via `lib/webrtc.negotiateWebRTC`
  (`POST /api/cameras/{id}/webrtc`) e, quando indisponível (`409`/câmera
  não-H.264), a negociação falha, ou a conexão não fecha em 5s (watchdog),
  cai pro `hls.js`. A prop `transport` (o `live_transport` da câmera) pula o
  WebRTC quando `hls`. Autoplay mudo, overlay de loading/tap-to-play, retry
  com backoff+teto (`components/playerRetry.ts`), zoom
  (`hooks/usePlayerZoom.ts`, controle no rodapé via `Zoom`); rodapé
  (`PlayerFooter`) com nome da câmera + botões de mudo/`Zoom`/snapshot/tela
  cheia quando `title`/`controls` são passados.
- `components/PlayerFooter.tsx` — rodapé compartilhado por todo player,
  theme-aware (`bg-surface`/`text-foreground`/`border-border` — nunca cor
  fixa, mesmo sendo "chrome" de vídeo). Dois modos: com `title` (nome da
  câmera à esquerda + `children` como ações à direita, uso do `Player`) ou
  **freeform** (`title` ausente — só `children`, uso do `VideoPlayer`).
- `components/VideoPlayer.tsx` — motor de N segmentos MP4 em sequência
  (double-buffering, 2 `<video>` empilhados, sem tela preta na fronteira —
  MP4 não-fragmentado, MSE não é opção), compartilhado por
  `HistoryPage`/`VideoBrowserPage`. Rodapé (`PlayerFooter` freeform) com
  barra de progresso arrastável, play/pause, repeat, mudo, dropdown de
  velocidade, contador de segmento opcional, zoom, snapshot, download da
  gravação — **sempre visível**, não overlay de hover. Prop
  `footerExtra?: ReactNode` — linha extra dentro do rodapé pra a página
  injetar conteúdo específico sem o motor genérico conhecê-lo (ex.:
  `HistoryPage` usa isso pro switch de reprodução contínua + `DatePicker`).
  Prop `overlay?: ReactNode` — conteúdo sobreposto ao vídeo (loading/erro).
- `components/Zoom.tsx` — controle de zoom explícito e sempre visível
  (`− 100% +`), compartilhado por `Player`/`VideoPlayer`. `usePlayerZoom.ts`
  (hook do scroll-to-zoom/drag-to-pan) expõe `zoomIn`/`zoomOut`/`canZoomIn`/
  `canZoomOut`.
- `components/RecordingPlayerModal.tsx` — reproduz uma gravação/clip em
  modal, sem sair da página que abriu (uso: `RecordingsPage`). Player
  "agnóstico": só `open`/`cameraId`/`recordingId`/`motionId?`/`onClose`,
  nenhum estado da página chamadora. Mesmo padrão de modal do `ConfirmDialog`
  (portal pra `document.body`, `z-10000`, `useEscapeKey`), fecha também no
  clique do backdrop. **Arrastável e redimensionável**
  (`useDraggableResizable.ts`, Pointer Events puros, sem lib): a altura é
  sempre derivada da largura (`width / aspectRatio + chromeHeight`) — trava
  a proporção 16:9 por construção, já que só existe um estado (`width`).
  `hooks/useRecordingSegments.ts` resolve `cameraId`+`recordingId(/motionId)`
  em `VideoPlayerSegment[]`.
- `components/CameraStageHeader.tsx` + `CameraViewTabs` — cabeçalho (nome +
  badge REC + abas "Ao vivo"/"Histórico") compartilhado por
  `LivePage`/`HistoryPage`.

## Decisões e invariantes

- **`seekGlobal` (arraste da barra de progresso) espera o decoder, não um
  timer fixo.** Um seek BACKWARD custa mais que forward (precisa voltar pro
  keyframe anterior e decodificar pra frente); as gravações são copiadas
  sem reencode (`internal/recorder`, `-c copy`), então o intervalo de
  keyframe é o da própria câmera. Um throttle por tempo fixo não é
  suficiente — um seek distante pode levar mais que 16ms (mais ainda num
  Raspberry Pi), e pedir o próximo antes do anterior terminar força o
  decoder a abortar/reiniciar repetidamente (vídeo "piscando"). Em vez
  disso, `seekGlobal` espera `el.seeking === false` (poll via
  `requestAnimationFrame`) antes do próximo seek pendente — ritmo ditado
  pelo PRÓPRIO decoder. A posição visual (`pos`) continua síncrona a cada
  chamada; só a mutação real do `<video>` espera.
- **Snapshot é client-side puro** (`hooks/usePlayerSnapshot.ts`, compartilhado
  por `Player`/`VideoPlayer`): captura o frame atual num `<canvas>`
  (`drawImage` nas dimensões nativas) e baixa como PNG — sem chamada ao
  backend, o frame já está decodificado no elemento.
- `RecordingPlayerModal`: `MODAL_CHROME_HEIGHT` (altura fixa de
  cabeçalho+padding+rodapé, somada por cima da área do vídeo) é uma
  estimativa calculada a partir da estrutura renderizada, não medida via
  `ResizeObserver` — diferente do padrão "medir em vez de chutar" usado em
  `HistoryPage` (ver abaixo); vale checagem visual pontual se o número se
  mostrar errado no browser real.
- `idPrefix="recording-player"` do `VideoPlayer` interno do modal é
  deliberadamente distinto do `id="recording-player-modal"` do wrapper —
  `VideoPlayer` usa `id={idPrefix}` cru no container, mesmo valor colidiria.

## `HistoryPage`: duas colunas e altura do sidebar

`HistoryPage` usa `VideoPlayer` à esquerda + `#history-recordings-list`
(sidebar, `lg:w-80 lg:shrink-0`) à direita — a sidebar precisa da MESMA
altura do fundo do player. `align-items: stretch` sozinho não resolve: sem
uma altura EXTERNA de referência, o flexbox usa o MAIOR conteúdo hipotético
entre os irmãos — com lista longa de gravações a sidebar vira o maior, e
stretch infla o player até o tamanho dela (vão vazio abaixo do rodapé, bug
real visto no navegador).

**Solução**: medir `history-main` com `ResizeObserver` e aplicar o valor
como `maxHeight` inline no sidebar (`overflow-hidden`); a linha usa
`lg:items-start` (sem stretch), quebrando o ciclo — `history-main` nunca
depende do sidebar, só o contrário. O ref é um **ref CALLBACK**
(`mainRef`), não `useRef`+`useEffect(fn, [])`: `history-main` só monta
depois que `camera` carrega (fetch assíncrono), então um `useEffect` de
deps vazias rodaria ANTES do node existir e nunca mais tentaria de novo —
bug real confirmado em browser real (Playwright/Chromium). Um ref callback
dispara toda vez que o node MUDA, inclusive quando passa a existir num
render posterior. `ResizeObserver` não existe no jsdom dos testes — degrada
graciosamente pra sem teto.

## Ver também
- [pages.md](pages.md) — `HistoryPage`/`VideoBrowserPage`/`RecordingsPage` usando estes componentes
- [design-system.md](design-system.md) — regra "theme-aware, nunca cor fixa"
