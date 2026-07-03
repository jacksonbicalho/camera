import { describe, it, expect } from 'vitest'
import { formatDateTime } from './datetime'

describe('formatDateTime', () => {
  it('localiza um instante UTC no timezone dado (America/Sao_Paulo = UTC-3)', () => {
    const s = formatDateTime('2026-07-03T20:18:44Z', 'America/Sao_Paulo')
    expect(s).toContain('03/07/2026')
    expect(s).toContain('17:18:44')
  })

  it('respeita UTC quando esse é o timezone', () => {
    expect(formatDateTime('2026-07-03T20:18:44Z', 'UTC')).toContain('20:18:44')
  })

  it('timezone vazio cai em UTC', () => {
    expect(formatDateTime('2026-07-03T20:18:44Z', '')).toContain('20:18:44')
  })

  it('ISO inválido → vazio', () => {
    expect(formatDateTime('não-é-data', 'UTC')).toBe('')
  })
})
