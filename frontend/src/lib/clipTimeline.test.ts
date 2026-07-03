import { describe, it, expect } from 'vitest'
import { segmentDuration, clipTotal, globalTime, locate, formatClock } from './clipTimeline'
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
