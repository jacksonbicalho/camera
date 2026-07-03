import { describe, expect, it } from 'vitest'
import {
  timelineRangeMs,
  timelineWindow,
  timePosFraction,
  isInWindow,
  timelineTicks,
  posToTime,
  recordingAtMs,
  filmstripSamples,
  mergeRecordingRuns,
} from './timelineScale'
import type { Recording } from '../pages/cameraUtils'

const HOUR = 3600_000

function rec(id: number, startMs: number, isRecording = false): Recording {
  return { id, filename: `r${id}`, start: new Date(startMs).toISOString(), url: '', is_recording: isRecording, has_motion: false }
}

describe('timelineRangeMs', () => {
  it('durações por range', () => {
    expect(timelineRangeMs('1h')).toBe(HOUR)
    expect(timelineRangeMs('6h')).toBe(6 * HOUR)
    expect(timelineRangeMs('24h')).toBe(24 * HOUR)
  })
})

describe('timelineWindow', () => {
  it('termina no anchor e recua a duração', () => {
    const end = 10 * HOUR
    expect(timelineWindow(end, '1h')).toEqual({ startMs: 9 * HOUR, endMs: 10 * HOUR })
    expect(timelineWindow(end, '6h')).toEqual({ startMs: 4 * HOUR, endMs: 10 * HOUR })
  })
})

describe('timePosFraction', () => {
  const win = { startMs: 0, endMs: HOUR }
  it('mapeia início/meio/fim', () => {
    expect(timePosFraction(0, win)).toBe(0)
    expect(timePosFraction(HOUR / 2, win)).toBe(0.5)
    expect(timePosFraction(HOUR, win)).toBe(1)
  })
  it('clampa fora da janela', () => {
    expect(timePosFraction(-HOUR, win)).toBe(0)
    expect(timePosFraction(2 * HOUR, win)).toBe(1)
  })
  it('span inválido devolve 0', () => {
    expect(timePosFraction(5, { startMs: 10, endMs: 10 })).toBe(0)
  })
})

describe('isInWindow', () => {
  const win = { startMs: 0, endMs: HOUR }
  it('dentro/fora', () => {
    expect(isInWindow(HOUR / 2, win)).toBe(true)
    expect(isInWindow(0, win)).toBe(true)
    expect(isInWindow(HOUR, win)).toBe(true)
    expect(isInWindow(-1, win)).toBe(false)
    expect(isInWindow(HOUR + 1, win)).toBe(false)
  })
})

describe('timelineTicks', () => {
  it('ticks uniformes inclusive extremos', () => {
    expect(timelineTicks({ startMs: 0, endMs: HOUR }, 3)).toEqual([0, HOUR / 2, HOUR])
  })
  it('count < 2 devolve só o início', () => {
    expect(timelineTicks({ startMs: 5, endMs: HOUR }, 1)).toEqual([5])
  })
})

describe('posToTime', () => {
  const win = { startMs: 0, endMs: HOUR }
  it('inverso de timePosFraction', () => {
    expect(posToTime(0, win)).toBe(0)
    expect(posToTime(0.5, win)).toBe(HOUR / 2)
    expect(posToTime(1, win)).toBe(HOUR)
  })
  it('clampa fração fora de 0..1', () => {
    expect(posToTime(-1, win)).toBe(0)
    expect(posToTime(2, win)).toBe(HOUR)
  })
  it('roundtrip com timePosFraction', () => {
    const win2 = { startMs: 1000, endMs: 1000 + HOUR }
    const t = 1000 + HOUR / 3
    expect(posToTime(timePosFraction(t, win2), win2)).toBeCloseTo(t, 3)
  })
})

describe('recordingAtMs', () => {
  const recs = [rec(1, 0), rec(2, 300_000), rec(3, 600_000, true)]
  const chunk = 300_000
  it('acha a gravação e o offset', () => {
    const r = recordingAtMs(recs, 60_000, chunk)
    expect(r?.rec.id).toBe(1)
    expect(r?.offsetSeconds).toBe(60)
  })
  it('lacuna devolve null', () => {
    expect(recordingAtMs(recs, 1_000_000, chunk)).toBeNull()
  })
  it('ignora gravação ativa (is_recording)', () => {
    expect(recordingAtMs(recs, 650_000, chunk)).toBeNull()
  })
})

describe('filmstripSamples', () => {
  const chunks = (n: number) => Array.from({ length: n }, (_, i) => rec(i + 1, i * 300_000))
  it('devolve TODAS as gravações na janela, no início do chunk, em ordem', () => {
    const out = filmstripSamples(chunks(3), { startMs: 0, endMs: 1_000_000 })
    expect(out.map(s => s.rec.id)).toEqual([1, 2, 3])
    expect(out.map(s => s.ms)).toEqual([0, 300_000, 600_000])
    expect(out.every(s => s.offsetSeconds === 0)).toBe(true)
  })
  it('ignora gravações fora da janela e o chunk em gravação (is_recording)', () => {
    const recs = [rec(1, 0), rec(2, 300_000), rec(3, 600_000, true), rec(4, 5_000_000)]
    const out = filmstripSamples(recs, { startMs: 0, endMs: 900_000 })
    expect(out.map(s => s.rec.id)).toEqual([1, 2])
  })
  it('janela sem gravações devolve vazio', () => {
    expect(filmstripSamples([], { startMs: 0, endMs: 900_000 })).toEqual([])
  })

  it('limita a maxSamples por downsample uniforme, preservando os extremos', () => {
    // 10 chunks a cada 60s; maxSamples=4 → mantém ~1 a cada k, incluindo 1º e último.
    const recs = Array.from({ length: 10 }, (_, i) => rec(i + 1, i * 60_000))
    const out = filmstripSamples(recs, { startMs: 0, endMs: 1_000_000 }, { maxSamples: 4 })
    expect(out.length).toBeLessThanOrEqual(4)
    expect(out[0].rec.id).toBe(1)
    expect(out[out.length - 1].rec.id).toBe(10)
  })

  it('sempre inclui keepRecId mesmo quando o downsample o cortaria', () => {
    const recs = Array.from({ length: 10 }, (_, i) => rec(i + 1, i * 60_000))
    const out = filmstripSamples(recs, { startMs: 0, endMs: 1_000_000 }, { maxSamples: 4, keepRecId: 5 })
    expect(out.map(s => s.rec.id)).toContain(5)
    expect(out.length).toBeLessThanOrEqual(4)
  })

  it('sem cap (default alto) devolve todas as gravações da janela', () => {
    const recs = Array.from({ length: 5 }, (_, i) => rec(i + 1, i * 60_000))
    const out = filmstripSamples(recs, { startMs: 0, endMs: 1_000_000 })
    expect(out.map(s => s.rec.id)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('mergeRecordingRuns', () => {
  const CHUNK = 5 * 60_000
  it('funde N chunks contíguos (gap <= chunkMs) num único run', () => {
    // 4 chunks a cada 30s → um trecho contínuo → 1 run.
    const recs = Array.from({ length: 4 }, (_, i) => rec(i + 1, i * 30_000))
    const runs = mergeRecordingRuns(recs, CHUNK)
    expect(runs).toEqual([{ startMs: 0, endMs: 3 * 30_000 + CHUNK }])
  })

  it('quebra em dois runs quando há vão real (gap > chunkMs)', () => {
    const recs = [rec(1, 0), rec(2, 30_000), rec(3, 30_000 + 10 * 60_000)]
    const runs = mergeRecordingRuns(recs, CHUNK)
    expect(runs.length).toBe(2)
    expect(runs[0]).toEqual({ startMs: 0, endMs: 30_000 + CHUNK })
    expect(runs[1]).toEqual({ startMs: 30_000 + 10 * 60_000, endMs: 30_000 + 10 * 60_000 + CHUNK })
  })

  it('ignora o chunk em gravação (is_recording)', () => {
    const recs = [rec(1, 0), rec(2, 30_000, true)]
    const runs = mergeRecordingRuns(recs, CHUNK)
    expect(runs).toEqual([{ startMs: 0, endMs: CHUNK }])
  })

  it('lista vazia devolve vazio', () => {
    expect(mergeRecordingRuns([], CHUNK)).toEqual([])
  })
})
