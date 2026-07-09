import { describe, it, expect } from 'vitest'
import {
  segmentDuration,
  clipTotal,
  globalTime,
  locate,
  formatClock,
  shouldAdvance,
} from './clipTimeline'
import type { ClipSegment } from './recordingsGateway'

function seg(fromSeconds: number, toSeconds: number): ClipSegment {
  return { recording: {} as ClipSegment['recording'], fromSeconds, toSeconds }
}

describe('segmentDuration', () => {
  it('usa toSeconds - fromSeconds quando não há duração real', () => {
    expect(segmentDuration(seg(2, 10))).toBe(8)
  })
  it('clampa pelo arquivo real quando o toSeconds inferido passa da duração', () => {
    expect(segmentDuration(seg(0, 10), 9)).toBe(9) // vão: arquivo de 9s, toSeconds 10
  })
  it('para toSeconds Infinity usa a duração real', () => {
    expect(segmentDuration(seg(0, Infinity), 12)).toBe(12)
  })
  it('para toSeconds Infinity sem duração real dá 0', () => {
    expect(segmentDuration(seg(0, Infinity))).toBe(0)
  })
})

describe('shouldAdvance', () => {
  it('avança ao cruzar toSeconds (caminho normal, trim de evento)', () => {
    expect(shouldAdvance(10, 10, undefined)).toBe(true)
    expect(shouldAdvance(9.9, 10, undefined)).toBe(false)
  })
  it('avança perto do fim real quando toSeconds (timestamp de parede) é um pouco MAIOR que a duração real — sem isso currentTime nunca alcançaria toSeconds', () => {
    // gravação: end - start = 300s (toSeconds), mas o arquivo de fato só tem 299.9s
    expect(shouldAdvance(299.9, 300, 299.9)).toBe(true)
  })
  it('não avança fora das duas margens', () => {
    expect(shouldAdvance(100, 300, 299.9)).toBe(false)
  })
  it('toSeconds Infinity (gravação inteira, sem trim): só o fim real decide', () => {
    expect(shouldAdvance(14.9, Infinity, 15)).toBe(true)
    expect(shouldAdvance(5, Infinity, 15)).toBe(false)
  })
  it('duração real ainda não conhecida (undefined): não derruba o corte por toSeconds', () => {
    expect(shouldAdvance(5, Infinity, undefined)).toBe(false)
  })
})

describe('clipTotal / globalTime / locate', () => {
  const durations = [10, 9, 4] // 3 segmentos

  it('clipTotal soma as durações', () => {
    expect(clipTotal(durations)).toBe(23)
  })

  it('globalTime soma os segmentos anteriores + offset local', () => {
    expect(globalTime(durations, 0, 3)).toBe(3)
    expect(globalTime(durations, 1, 5)).toBe(15) // 10 + 5
    expect(globalTime(durations, 2, 2)).toBe(21) // 10 + 9 + 2
  })

  it('locate mapeia posição global → segmento + offset', () => {
    expect(locate(durations, 3)).toEqual({ index: 0, localOffset: 3 })
    expect(locate(durations, 15)).toEqual({ index: 1, localOffset: 5 })
    expect(locate(durations, 21)).toEqual({ index: 2, localOffset: 2 })
  })

  it('locate clampa nas bordas', () => {
    expect(locate(durations, -5)).toEqual({ index: 0, localOffset: 0 })
    expect(locate(durations, 999)).toEqual({ index: 2, localOffset: 4 })
    expect(locate([], 5)).toEqual({ index: 0, localOffset: 0 })
  })
})

describe('formatClock', () => {
  it('formata m:ss e h:mm:ss', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(3661)).toBe('1:01:01')
    expect(formatClock(-3)).toBe('0:00')
  })
})
