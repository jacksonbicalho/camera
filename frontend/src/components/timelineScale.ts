import type { Recording } from '../pages/cameraUtils'

// Escala da timeline horizontal (redesign do Escopo B). Helpers puros para
// mapear tempo ↔ posição dentro de uma janela [startMs, endMs].

export type TimelineRange = '1h' | '6h' | '24h'

export interface TimelineWindow {
  startMs: number
  endMs: number
}

const RANGE_MS: Record<TimelineRange, number> = {
  '1h': 3600_000,
  '6h': 6 * 3600_000,
  '24h': 24 * 3600_000,
}

export function timelineRangeMs(range: TimelineRange): number {
  return RANGE_MS[range]
}

// Janela que termina no anchor e recua a duração do range.
export function timelineWindow(endMs: number, range: TimelineRange): TimelineWindow {
  return { startMs: endMs - RANGE_MS[range], endMs }
}

// Fração 0..1 da posição de um timestamp dentro da janela (clampada).
export function timePosFraction(tsMs: number, win: TimelineWindow): number {
  const span = win.endMs - win.startMs
  if (span <= 0) return 0
  const f = (tsMs - win.startMs) / span
  return f < 0 ? 0 : f > 1 ? 1 : f
}

export function isInWindow(tsMs: number, win: TimelineWindow): boolean {
  return tsMs >= win.startMs && tsMs <= win.endMs
}

// Inverso de timePosFraction: fração 0..1 → timestamp (ms) na janela.
export function posToTime(fraction: number, win: TimelineWindow): number {
  const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction
  return win.startMs + f * (win.endMs - win.startMs)
}

export interface FilmstripSample {
  ms: number
  rec: Recording
  offsetSeconds: number
}

// filmstripSamples devolve **todas** as gravações completas dentro da janela
// (ignorando o chunk em gravação), ordenadas por início. O filmstrip rola
// (com setas) para alcançar as que não cabem na largura. O ponto de cada amostra
// é o início do chunk (`ms = rec.start`, `offset = 0`): o thumbnail (event-frame)
// sempre resolve para aquele chunk completo e nunca "vaza" para o chunk em gravação.
// Máximo de miniaturas materializadas no filmstrip. Acima disso, downsample
// uniforme — evita milhares de <button> no range 24h (~1 chunk/30s = milhares/dia).
const DEFAULT_MAX_SAMPLES = 120

export interface FilmstripSampleOpts {
  /** Teto de amostras; acima disso faz downsample uniforme. Default 120. */
  maxSamples?: number
  /** Gravação a incluir sempre (a ativa), para preservar o highlight/scroll-to. */
  keepRecId?: number
}

export function filmstripSamples(
  recordings: Recording[],
  win: TimelineWindow,
  opts: FilmstripSampleOpts = {},
): FilmstripSample[] {
  const all: FilmstripSample[] = recordings
    .filter(r => !r.is_recording)
    .map(r => ({ rec: r, ms: Date.parse(r.start) }))
    .filter(x => !Number.isNaN(x.ms) && x.ms >= win.startMs && x.ms <= win.endMs)
    .sort((a, b) => a.ms - b.ms)
    .map(x => ({ ms: x.ms, rec: x.rec, offsetSeconds: 0 }))

  const max = opts.maxSamples ?? DEFAULT_MAX_SAMPLES
  if (all.length <= max) return all

  // Downsample uniforme mantendo os extremos: escolhe `max` índices espaçados.
  const kept = new Set<number>()
  for (let i = 0; i < max; i++) {
    kept.add(Math.round((i * (all.length - 1)) / (max - 1)))
  }
  // Sempre inclui a gravação ativa (senão o highlight/scroll-to some) — substitui
  // a amostra mais próxima em vez de adicionar, mantendo o teto `max`.
  if (opts.keepRecId != null) {
    const idx = all.findIndex(s => s.rec.id === opts.keepRecId)
    if (idx >= 0 && !kept.has(idx)) {
      let nearest = -1
      let best = Infinity
      for (const k of kept) {
        const d = Math.abs(k - idx)
        if (d < best) { best = d; nearest = k }
      }
      if (nearest >= 0) kept.delete(nearest)
      kept.add(idx)
    }
  }
  return [...kept].sort((a, b) => a - b).map(i => all[i])
}

export interface RecordingRun {
  startMs: number
  endMs: number
}

// Funde gravações contíguas em "runs" para o timeline desenhar um <span> por
// trecho contínuo em vez de um por chunk (milhares no range 24h). Gravações (não
// em gravação) ordenadas por início; chunks com gap entre inícios `<= chunkMs`
// coalescem; `endMs` do run = início do último chunk do run + chunkMs. Um vão real
// (gap > chunkMs) quebra o run.
export function mergeRecordingRuns(recordings: Recording[], chunkMs: number): RecordingRun[] {
  const starts = recordings
    .filter(r => !r.is_recording)
    .map(r => Date.parse(r.start))
    .filter(ms => !Number.isNaN(ms))
    .sort((a, b) => a - b)

  const runs: RecordingRun[] = []
  for (const startMs of starts) {
    const last = runs[runs.length - 1]
    if (last && startMs - (last.endMs - chunkMs) <= chunkMs) {
      last.endMs = startMs + chunkMs
    } else {
      runs.push({ startMs, endMs: startMs + chunkMs })
    }
  }
  return runs
}

// Gravação (não-ativa) cujo intervalo [start, start+chunk) cobre o ms, e o
// offset em segundos dentro dela. `null` numa lacuna (sem gravação no instante).
export function recordingAtMs(
  recordings: Recording[],
  ms: number,
  chunkMs: number,
): { rec: Recording; offsetSeconds: number } | null {
  for (const rec of recordings) {
    if (rec.is_recording) continue
    const startMs = Date.parse(rec.start)
    if (Number.isNaN(startMs)) continue
    if (ms >= startMs && ms < startMs + chunkMs) {
      return { rec, offsetSeconds: Math.max(0, (ms - startMs) / 1000) }
    }
  }
  return null
}

// `count` timestamps uniformemente espaçados, inclusive os extremos.
export function timelineTicks(win: TimelineWindow, count: number): number[] {
  if (count < 2) return [win.startMs]
  const span = win.endMs - win.startMs
  const step = span / (count - 1)
  return Array.from({ length: count }, (_, i) => win.startMs + step * i)
}
