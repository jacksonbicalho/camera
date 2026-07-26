export interface TileLayout {
  i: string
  x: number
  y: number
  w: number
  h: number
}

const STORAGE_KEY = 'liveview-layout'
const COLS_KEY = 'liveview-cols'
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
// aparece sem posição conhecida): mesmo espírito do gridColumns() de AllCamerasPage, só que
// em unidades de grid (dá pra arrastar/redimensionar depois, ao contrário do CSS grid puro
// de lá). DEFAULT_COLS=3 reproduz o arranjo fixo que já existia aqui.
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
// mesmo arranjo automático de defaultLayout, deslocado abaixo do que já existe.
export function mergeLayoutWithCameras(
  saved: readonly TileLayout[],
  cameraIds: string[],
): TileLayout[] {
  const savedById = new Map(saved.map((t) => [t.i, t]))
  const known = saved.filter((t) => cameraIds.includes(t.i))
  const newIds = cameraIds.filter((id) => !savedById.has(id))
  if (newIds.length === 0) return known
  const maxY = known.reduce((m, t) => Math.max(m, t.y + t.h), 0)
  const added = defaultLayout(newIds).map((t) => ({ ...t, y: t.y + maxY }))
  return [...known, ...added]
}
