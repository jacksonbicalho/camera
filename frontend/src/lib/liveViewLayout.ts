export interface TileLayout {
  i: string
  x: number
  y: number
  w: number
  h: number
}

const STORAGE_KEY = 'liveview-layout'
const COLS = 12
const TILE_W = 4
const TILE_H = 4

// defaultLayout — arranjo automático em grade (12 colunas) quando não há layout salvo (ou
// quando uma câmera nova aparece sem posição conhecida): preenche da esquerda pra direita,
// de cima pra baixo — mesmo espírito do gridColumns() de AllCamerasPage, mas em unidades de
// grid (dá pra arrastar/redimensionar depois, ao contrário do CSS grid puro de lá).
export function defaultLayout(cameraIds: string[]): TileLayout[] {
  const perRow = Math.max(1, Math.floor(COLS / TILE_W))
  return cameraIds.map((id, idx) => ({
    i: id,
    x: (idx % perRow) * TILE_W,
    y: Math.floor(idx / perRow) * TILE_H,
    w: TILE_W,
    h: TILE_H,
  }))
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
