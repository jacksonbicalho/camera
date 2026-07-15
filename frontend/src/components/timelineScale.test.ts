import { describe, expect, it } from 'vitest'
import { isCoveredByRecording, posToTime, recordingAtMs, timePosFraction } from './timelineScale'

const win = { startMs: 0, endMs: 24 * 3600_000 } // dia inteiro, 0 = meia-noite

describe('timePosFraction', () => {
  it('mapeia um timestamp dentro da janela para uma fração 0..1', () => {
    expect(timePosFraction(0, win)).toBe(0)
    expect(timePosFraction(win.endMs, win)).toBe(1)
    expect(timePosFraction(12 * 3600_000, win)).toBe(0.5)
  })
  it('clampa timestamps fora da janela', () => {
    expect(timePosFraction(-1000, win)).toBe(0)
    expect(timePosFraction(win.endMs + 1000, win)).toBe(1)
  })
})

describe('posToTime', () => {
  it('é o inverso de timePosFraction', () => {
    expect(posToTime(0, win)).toBe(win.startMs)
    expect(posToTime(1, win)).toBe(win.endMs)
    expect(posToTime(0.5, win)).toBe(12 * 3600_000)
  })
  it('clampa frações fora de 0..1', () => {
    expect(posToTime(-0.5, win)).toBe(win.startMs)
    expect(posToTime(1.5, win)).toBe(win.endMs)
  })
})

describe('recordingAtMs', () => {
  const chunkMs = 5 * 60_000
  const items = [
    { rec: { id: 1, start: '2026-07-05T07:00:00Z' } },
    { rec: { id: 2, start: '2026-07-05T07:10:00Z' } },
    { rec: { id: 3, start: '2026-07-05T18:00:00Z' } },
  ]

  it('acha o item cujo intervalo [start, start+chunkMs) cobre o instante', () => {
    const ms = Date.parse('2026-07-05T07:11:00Z')
    expect(recordingAtMs(items, ms, chunkMs)?.rec.id).toBe(2)
  })
  it('sem cobertura exata, devolve o item mais próximo ANTES do instante', () => {
    const ms = Date.parse('2026-07-05T07:30:00Z') // entre o fim do item 2 e o início do 3
    expect(recordingAtMs(items, ms, chunkMs)?.rec.id).toBe(2)
  })
  it('sem cobertura exata, devolve o item mais próximo DEPOIS do instante (nenhum item antes)', () => {
    const ms = Date.parse('2026-07-05T00:00:00Z') // antes de qualquer item — só 1/2/3 vêm depois
    expect(recordingAtMs(items, ms, chunkMs)?.rec.id).toBe(1)
  })
  it('lista vazia devolve null', () => {
    expect(recordingAtMs([], Date.now(), chunkMs)).toBeNull()
  })
})

describe('isCoveredByRecording', () => {
  const chunkMs = 5 * 60_000
  const items = [
    { rec: { id: 1, start: '2026-07-05T07:00:00Z' } },
    { rec: { id: 3, start: '2026-07-05T18:00:00Z' } },
  ]

  it('true quando o instante cai dentro de [start, start+chunkMs) de alguma gravação', () => {
    const ms = Date.parse('2026-07-05T07:02:00Z')
    expect(isCoveredByRecording(items, ms, chunkMs)).toBe(true)
  })

  it('false numa lacuna (nenhuma gravação cobre o instante) — mesmo tendo uma "mais próxima"', () => {
    const ms = Date.parse('2026-07-05T12:00:00Z') // bem no meio da lacuna entre 07h e 18h
    expect(isCoveredByRecording(items, ms, chunkMs)).toBe(false)
  })

  it('false com lista vazia', () => {
    expect(isCoveredByRecording([], Date.now(), chunkMs)).toBe(false)
  })
})
