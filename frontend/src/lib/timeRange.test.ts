import { describe, it, expect } from 'vitest'
import { clockTimeToMinutes, matchesTimeRange, type ClockTime } from './timeRange'

describe('clockTimeToMinutes', () => {
  it('converte hora:minuto pra minutos desde meia-noite', () => {
    expect(clockTimeToMinutes({ hour: 0, minute: 0 })).toBe(0)
    expect(clockTimeToMinutes({ hour: 1, minute: 30 })).toBe(90)
    expect(clockTimeToMinutes({ hour: 23, minute: 59 })).toBe(1439)
  })
})

describe('matchesTimeRange', () => {
  describe('CA2: sem from nem to, sempre casa (sem filtro)', () => {
    it('sem from nem to, sempre true', () => {
      expect(matchesTimeRange('2026-07-05T10:00:00Z', null, null)).toBe(true)
    })
  })

  describe('CA2: só "De" preenchido — filtro aberto a partir daquele horário até o fim do dia', () => {
    const from: ClockTime = { hour: 9, minute: 0 }
    it('horário depois de "from" casa', () => {
      expect(matchesTimeRange('2026-07-05T23:00:00', from, null)).toBe(true)
    })
    it('horário igual a "from" casa (inclusivo)', () => {
      expect(matchesTimeRange('2026-07-05T09:00:00', from, null)).toBe(true)
    })
    it('horário antes de "from" não casa', () => {
      expect(matchesTimeRange('2026-07-05T08:59:00', from, null)).toBe(false)
    })
  })

  describe('CA2: só "Até" preenchido — filtro aberto do início do dia até aquele horário', () => {
    const to: ClockTime = { hour: 17, minute: 0 }
    it('horário antes de "to" casa', () => {
      expect(matchesTimeRange('2026-07-05T00:00:00', null, to)).toBe(true)
      expect(matchesTimeRange('2026-07-05T16:59:00', null, to)).toBe(true)
    })
    it('horário igual a "to" NÃO casa (exclusivo, mesma convenção do limite superior de sempre)', () => {
      expect(matchesTimeRange('2026-07-05T17:00:00', null, to)).toBe(false)
    })
    it('horário depois de "to" não casa', () => {
      expect(matchesTimeRange('2026-07-05T17:01:00', null, to)).toBe(false)
    })
  })

  describe('CA2: intervalo normal (from < to) — comparação só de hora:minuto LOCAL, ignora a data', () => {
    const from: ClockTime = { hour: 9, minute: 0 }
    const to: ClockTime = { hour: 17, minute: 0 }
    it('horário dentro do intervalo casa', () => {
      expect(matchesTimeRange('2026-07-05T12:30:00', from, to)).toBe(true)
    })
    it('horário igual ao limite inferior casa (inclusivo)', () => {
      expect(matchesTimeRange('2026-07-05T09:00:00', from, to)).toBe(true)
    })
    it('horário igual ao limite superior NÃO casa (exclusivo)', () => {
      expect(matchesTimeRange('2026-07-05T17:00:00', from, to)).toBe(false)
    })
    it('horário fora do intervalo (antes ou depois) não casa', () => {
      expect(matchesTimeRange('2026-07-05T08:59:00', from, to)).toBe(false)
      expect(matchesTimeRange('2026-07-05T17:01:00', from, to)).toBe(false)
    })
  })

  describe('CA2: startIso inválido — falha aberta (sempre casa) em vez de quebrar o filtro', () => {
    it('string que não é uma data válida sempre casa', () => {
      const from: ClockTime = { hour: 9, minute: 0 }
      const to: ClockTime = { hour: 17, minute: 0 }
      expect(matchesTimeRange('not-a-date', from, to)).toBe(true)
    })
  })
})
