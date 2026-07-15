// timelineScale — funções puras de mapeamento tempo↔posição pro HistoryTimeline.
// Adaptado do timelineScale.ts original (removido junto com a antiga CameraPage) —
// só a parte pura sobrevive aqui; o resto (janelas de zoom, filmstrip permanente) não é
// necessário no desenho atual (régua fixa de 24h, sem seletor de janela).

export interface TimelineWindow {
  startMs: number
  endMs: number
}

// Fração 0..1 da posição de um timestamp dentro da janela (clampada).
export function timePosFraction(tsMs: number, win: TimelineWindow): number {
  const span = win.endMs - win.startMs
  if (span <= 0) return 0
  const f = (tsMs - win.startMs) / span
  return f < 0 ? 0 : f > 1 ? 1 : f
}

// Inverso de timePosFraction: fração 0..1 → timestamp (ms) na janela.
export function posToTime(fraction: number, win: TimelineWindow): number {
  const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction
  return win.startMs + f * (win.endMs - win.startMs)
}

// Item (gravação) cujo intervalo [start, start+chunkMs) cobre o instante `ms`; sem
// cobertura exata, devolve o item cujo início está mais próximo de `ms` (antes ou
// depois) — sempre um resultado útil pro preview/seleção, em vez de "nada" numa lacuna.
// Não devolve offsetSeconds (diferente do original): a seleção aqui é sempre a
// gravação inteira (mesma granularidade de clicar um card da lista), não um instante
// preciso dentro dela.
export function recordingAtMs<T extends { rec: { start: string } }>(
  items: T[],
  ms: number,
  chunkMs: number,
): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const item of items) {
    const startMs = Date.parse(item.rec.start)
    if (Number.isNaN(startMs)) continue
    if (ms >= startMs && ms < startMs + chunkMs) return item
    const dist = Math.abs(ms - startMs)
    if (dist < bestDist) {
      bestDist = dist
      best = item
    }
  }
  return best
}

// true sse `ms` cai dentro de [start, start+chunkMs) de ALGUMA gravação — diferente de
// `recordingAtMs`, que sempre acha "a mais próxima" mesmo numa lacuna sem gravação
// nenhuma. Usado pra decidir se o preview (imagem) deve aparecer: sem cobertura real,
// mostrar uma miniatura da gravação mais próxima seria enganoso (parece que tem vídeo
// ali, mas não tem).
export function isCoveredByRecording<T extends { rec: { start: string } }>(
  items: T[],
  ms: number,
  chunkMs: number,
): boolean {
  return items.some((item) => {
    const startMs = Date.parse(item.rec.start)
    return !Number.isNaN(startMs) && ms >= startMs && ms < startMs + chunkMs
  })
}
