# Páginas principais

Todas usam o shell `Layout` (ver [shell-layout.md](shell-layout.md)).

## Arquivos principais

- `pages/LiveViewPage.tsx` (`/`) — **página principal do sistema**. Grid
  customizável de todas as câmeras ao vivo, via `react-grid-layout/legacy`
  (subpath com API v1 clássica, escolhido deliberadamente por
  compatibilidade — a lib teve um rewrite v2 baseado em hooks). Sem
  câmeras cadastradas, mostra mensagem vazia (admin é redirecionado pro
  cadastro).
- `pages/LivePage.tsx` (`/live/:cameraId`) — `CameraStageHeader` + `Player`.
- `pages/HistoryPage.tsx` (`/history/:cameraId(/:recordingId)`) — gravações
  do dia + player + tira de cards pra trocar de gravação; `:recordingId` na
  URL pré-seleciona e a seleção mantém a URL sincronizada (link
  compartilhável). Layout de duas colunas detalhado em [player.md](player.md).
- `pages/VideoBrowserPage.tsx`
  (`/recording/:cameraId/:recordingId(/:motionId)`) — reprodução via
  `RecordingsGateway` (único intermediário com o backend); `:motionId`
  monta o clip com lead/trail em torno do evento.
- `pages/RecordingsPage.tsx` (`/recordings(/:date(/:hour(/:view)))`) —
  gravações + "momentos" (eventos de movimento/pessoa/label arbitrário)
  agregados multi-câmera; filtro de categoria (multi-seleção) + janela de
  horas.
  Clique abre `RecordingPlayerModal` (ver [player.md](player.md)).
- `pages/ReportsPage.tsx` (`/reports/:cameraId/:date/:days`) — histograma
  empilhado de eventos por categoria, por câmera, num intervalo de dias.

## `LiveViewPage`: layout e persistência

`lib/liveViewLayout.ts` — módulo puro (sem depender de `react-grid-layout`
nem de medição real de DOM, indisponível no jsdom dos testes): arranjo
automático, persistência em `localStorage` (`liveview-layout`) e
reconciliação do layout salvo com a lista atual de câmeras (câmera removida
some, nova entra no fim).

**Presets de layout** (1×1/2×2/3×3/4×4): resetam TODAS as câmeras VISÍVEIS
pra 1 célula cada (`presetLayout(cameraIds, cols)`), persistindo tanto o
preset (`liveview-cols`) quanto o layout resultante. Vivem num dropdown
(`live-view-preset-trigger`/`live-view-preset-menu`), mesmo padrão de
`ThemeModeNav` (`useFlyout`, portal, ancorado abaixo-à-direita). Uma "grade
customizada" (N solto ou "LxC" assimétrica) existiu e foi revertida a
pedido do navigator — só os 4 presets quadrados fixos permanecem.

**Grade NxN dimensionada pela viewport**: `computeRowHeight(viewportHeight,
gridTop, rows, bottomMargin=16, minRowHeight=80)` (`lib/liveViewLayout.ts`,
pura) divide a altura disponível (viewport − topo do grid − margem) pelas
linhas. A 1ª versão calculava `rowHeight` só a partir da LARGURA da coluna
(proporcional 16:9), ignorando a altura disponível — gerava células grandes
demais e forçava scroll num preset com várias linhas (achado do navigator
testando a página real). A página mede o topo do grid via
`getBoundingClientRect().top` (ref callback `useCallback`) + `window.innerHeight`,
recalculando no `resize`. `ResponsiveGridLayout` recebe
`containerPadding={[0, 0]}` — a lib aplica 10px de padding interno por
padrão, que somado ao `p-6` da página desalinhava os tiles da borda em ~10px
vs. qualquer outra página (bug real, confirmado por medição via Playwright).

**Curadoria de câmeras nesta tela** (a câmera continua funcionando
normalmente no sistema — só sai/entra DESTA tela): toggle "Editar grid"
(`live-view-edit-toggle`) trava/destrava `isDraggable`/`isResizable`; em
modo de edição, cada tile ganha um botão de remover (`ConfirmDialog` ao
confirmar) — `removeCameraFromLayout` tira a entrada do layout e o id vai
pro `liveview-hidden` (localStorage), sem placeholder vazio no lugar
(rejeitando o padrão de outro NVR usado como referência). Botão "Inserir
câmera" (`live-view-insert-camera`) abre um menu com as câmeras fora da
grade agora; `addCameraToLayout` tira o id de `liveview-hidden`.
`mergeLayoutWithCameras` recebe `hiddenIds` como parâmetro opcional — sem
isso, recarregar a página traria de volta uma câmera recém-removida (pra
reconciliação, pareceria só "uma câmera nova").

Todos os botões da toolbar usam `Button` compartilhado
(`components/ui/button.tsx`), nunca `<button>` cru — exceção: itens dentro
de flyouts/menus, que seguem o padrão de item de flyout.

## Ver também
- [player.md](player.md) — `VideoPlayer`/`Player`/`RecordingPlayerModal` usados por estas páginas
- [notifications.md](notifications.md) — navegação de uma notificação pra gravação
