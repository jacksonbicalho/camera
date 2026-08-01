export interface TileLayout {
  i: string
  x: number
  y: number
  w: number
  h: number
}

const STORAGE_KEY = 'liveview-layout'
const COLS_KEY = 'liveview-cols'
const HIDDEN_KEY = 'liveview-hidden'
export const DEFAULT_COLS = 3
export const LAYOUT_PRESETS = [1, 2, 3, 4] as const

// presetLayout — arranjo em grade NxN: cada câmera ocupa exatamente 1 célula (1x1), da
// esquerda pra direita, de cima pra baixo — usado quando o usuário escolhe um preset de
// layout (1×1/2×2/3×3/4×4/custom) e quando não há layout salvo ainda (defaultLayout,
// abaixo, delega pra cá com DEFAULT_COLS). `cols` é literalmente o nº de colunas do grid
// (react-grid-layout `cols` prop) — não uma grade fina de 12 subdividida, por isso cada
// câmera cabe numa única unidade.
export function presetLayout(cameraIds: string[], cols: number): TileLayout[] {
  const perRow = Math.max(1, cols)
  return cameraIds.map((id, idx) => ({
    i: id,
    x: idx % perRow,
    y: Math.floor(idx / perRow),
    w: 1,
    h: 1,
  }))
}

// defaultLayout — arranjo automático quando não há layout salvo (ou quando uma câmera nova
// aparece sem posição conhecida), em unidades de grid (dá pra arrastar/redimensionar depois).
// DEFAULT_COLS=3 reproduz o arranjo fixo que já existia aqui.
export function defaultLayout(cameraIds: string[]): TileLayout[] {
  return presetLayout(cameraIds, DEFAULT_COLS)
}

// loadSavedCols/saveCols — persiste o preset de layout escolhido (nº de colunas), separado
// do layout em si (chave própria) — a página usa isso pra saber o `cols` do
// react-grid-layout e computar a altura de linha proporcional (16:9) a partir dele.
export function loadSavedCols(): number | null {
  try {
    const raw = localStorage.getItem(COLS_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function saveCols(cols: number): void {
  try {
    localStorage.setItem(COLS_KEY, String(cols))
  } catch {
    // localStorage indisponível — mesmo espírito de saveLayout, falha silenciosa.
  }
}

// computeRowHeight — feedback do navigator: um preset "NxN" deve ser uma grade real de N
// linhas × N colunas que cabe na viewport (sem exigir scroll pra ver as N linhas), não uma
// altura derivada só da largura da coluna (que ignora a altura disponível e, com poucas
// linhas, sobra tela vazia; com muitas, estoura a viewport). `rows` aqui é sempre igual ao
// `cols` do preset (grade quadrada); `gridTop` é a distância do topo do grid até o topo da
// viewport (medida real do elemento, `getBoundingClientRect().top`) e `bottomMargin` reserva
// um respiro pro rodapé da página. `minRowHeight` evita células degeneradas (viewport muito
// baixa ou preset com muitas linhas) — nesse caso o grid volta a exigir scroll, mesmo
// trade-off de sempre (resize manual também não é travado, ver T4).
export function computeRowHeight(
  viewportHeight: number,
  gridTop: number,
  rows: number,
  bottomMargin = 16,
  minRowHeight = 80,
): number {
  const available = viewportHeight - gridTop - bottomMargin
  return Math.max(minRowHeight, available / Math.max(1, rows))
}

// clampColsForViewport — história feat/mobile-layout-responsivo: reduz o nº de
// colunas do grid em viewports estreitos, pra tiles não ficarem pequenos
// demais (ex.: 4 colunas em 375px dão tiles de ~65px, controles do Player
// transbordando). Só REDUZ, nunca aumenta o preset escolhido pelo usuário —
// mesmos limiares de breakpoint (`sm`=640px, `md`=768px) já usados em Tailwind
// no resto do app. Função pura, sem depender de DOM — o componente já mede
// `window.innerWidth` pra `computeRowHeight`, reaproveita a mesma leitura.
export function clampColsForViewport(cols: number, viewportWidth: number): number {
  if (viewportWidth < 640) return Math.min(cols, 1)
  if (viewportWidth < 768) return Math.min(cols, 2)
  return cols
}

// loadSavedLayout lê o layout persistido — null quando não há nada salvo, ou quando o valor
// salvo está corrompido/num formato inesperado (nunca lança, a página cai pro automático).
export function loadSavedLayout(): TileLayout[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

// `readonly` — react-grid-layout entrega `Layout` (somente-leitura) pro callback de
// onLayoutChange; estas funções só leem, nunca mutam, então aceitam os dois.
export function saveLayout(layout: readonly TileLayout[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // localStorage indisponível (modo privado, quota) — preferência de UI não é crítica,
    // falha silenciosa (mesmo espírito de outros usos de localStorage no app).
  }
}

// mergeLayoutWithCameras reconcilia o layout salvo com a lista ATUAL de câmeras: câmeras
// removidas somem do layout; câmeras novas (sem posição salva) entram no fim, usando o
// mesmo arranjo automático de defaultLayout, deslocado abaixo do que já existe. `hiddenIds`
// (T6, curadoria de câmeras na tela) exclui da auto-adição as câmeras que o usuário removeu
// explicitamente desta tela — sem isso, recarregar a página traria de volta uma câmera que
// o usuário tinha acabado de tirar (pra reconciliação, ela pareceria só "uma câmera nova").
export function mergeLayoutWithCameras(
  saved: readonly TileLayout[],
  cameraIds: string[],
  hiddenIds: readonly string[] = [],
): TileLayout[] {
  const savedById = new Map(saved.map((t) => [t.i, t]))
  const known = saved.filter((t) => cameraIds.includes(t.i))
  const newIds = cameraIds.filter((id) => !savedById.has(id) && !hiddenIds.includes(id))
  if (newIds.length === 0) return known
  const maxY = known.reduce((m, t) => Math.max(m, t.y + t.h), 0)
  const added = defaultLayout(newIds).map((t) => ({ ...t, y: t.y + maxY }))
  return [...known, ...added]
}

// removeCameraFromLayout/addCameraToLayout (T6) — curadoria de câmeras nesta tela: a câmera
// continua funcionando normalmente no sistema, só sai/entra da grade do LiveView. Sem
// placeholder/quadro vazio no lugar (pedido explícito do navigator) — a câmera removida
// simplesmente não tem mais entrada no array.
export function removeCameraFromLayout(
  layout: readonly TileLayout[],
  cameraId: string,
): TileLayout[] {
  return layout.filter((t) => t.i !== cameraId)
}

// addCameraToLayout adiciona 1 célula nova (1x1) pra `cameraId`, abaixo do que já existe —
// mesma lógica de posicionamento usada por mergeLayoutWithCameras pra câmeras novas (aqui
// sempre 1 câmera por vez, já que é sempre uma escolha do picker "Inserir câmera").
export function addCameraToLayout(layout: readonly TileLayout[], cameraId: string): TileLayout[] {
  const maxY = layout.reduce((m, t) => Math.max(m, t.y + t.h), 0)
  return [...layout, { i: cameraId, x: 0, y: maxY, w: 1, h: 1 }]
}

// loadHiddenCameraIds/saveHiddenCameraIds — persiste quais câmeras o usuário removeu
// explicitamente desta tela (chave própria, separada do layout) — usado por
// mergeLayoutWithCameras pra não trazê-las de volta sozinhas.
export function loadHiddenCameraIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHiddenCameraIds(ids: readonly string[]): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids))
  } catch {
    // localStorage indisponível — mesmo espírito de saveLayout, falha silenciosa.
  }
}
