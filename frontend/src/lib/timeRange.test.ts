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
  describe('CA3: filtro incompleto (from/to ausente) sempre casa — o filtro só entra em vigor com os dois preenchidos', () => {
    it('sem from nem to, sempre true', () => {
      expect(matchesTimeRange('2026-07-05T10:00:00Z', null, null)).toBe(true)
    })
    it('só from ou só to (filtro incompleto), sempre true', () => {
      const from: ClockTime = { hour: 9, minute: 0 }
      const to: ClockTime = { hour: 17, minute: 0 }
      expect(matchesTimeRange('2026-07-05T23:00:00Z', from, null)).toBe(true)
      expect(matchesTimeRange('2026-07-05T23:00:00Z', null, to)).toBe(true)
    })
  })

  describe('CA3: intervalo normal (from < to) — comparação só de hora:minuto LOCAL, ignora a data', () => {
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

  describe('CA3: intervalo cruzando a meia-noite (from > to, ex.: 22:00–02:00)', () => {
    const from: ClockTime = { hour: 22, minute: 0 }
    const to: ClockTime = { hour: 2, minute: 0 }
    it('horário logo depois de "from" (antes da meia-noite) casa', () => {
      expect(matchesTimeRange('2026-07-05T23:30:00', from, to)).toBe(true)
    })
    it('horário logo antes de "to" (depois da meia-noite) casa', () => {
      expect(matchesTimeRange('2026-07-05T01:30:00', from, to)).toBe(true)
    })
    it('horário durante o dia (fora do range noturno) não casa', () => {
      expect(matchesTimeRange('2026-07-05T12:00:00', from, to)).toBe(false)
    })
    it('horário igual ao limite inferior ("from") casa (inclusivo)', () => {
      expect(matchesTimeRange('2026-07-05T22:00:00', from, to)).toBe(true)
    })
    it('horário igual ao limite superior ("to") NÃO casa (exclusivo)', () => {
      expect(matchesTimeRange('2026-07-06T02:00:00', from, to)).toBe(false)
    })
  })

  describe('CA3: startIso inválido — falha aberta (sempre casa) em vez de quebrar o filtro', () => {
    it('string que não é uma data válida sempre casa', () => {
      const from: ClockTime = { hour: 9, minute: 0 }
      const to: ClockTime = { hour: 17, minute: 0 }
      expect(matchesTimeRange('not-a-date', from, to)).toBe(true)
    })
  })
})
