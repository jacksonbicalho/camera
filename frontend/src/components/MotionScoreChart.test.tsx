import { describe, it, expect } from 'vitest'
import { computeLogMax } from './motionScoreChartUtils'

describe('computeLogMax', () => {
  it('CA2: teto acompanha o maior entre threshold e dailyPeak, arredondado pra cima na potência de 10', () => {
    // max(0.009, 0.017) * 1.5 = 0.0255 -> log10 ~ -1.59 -> ceil -> -1 (0.1)
    expect(computeLogMax(0.009, 0.017)).toBe(-1)
  })

  it('CA2: usa o threshold quando ele é maior que o pico do dia', () => {
    // max(0.05, 0.01) * 1.5 = 0.075 -> log10 ~ -1.12 -> ceil -> -1 (0.1)
    expect(computeLogMax(0.05, 0.01)).toBe(-1)
  })

  it('CA2: nunca fica abaixo do piso mínimo, mesmo com threshold/dailyPeak muito baixos', () => {
    // max(0.0001, 0, MIN_CEILING=0.001) * 1.5 = 0.0015 -> log10 ~ -2.82 -> ceil -> -2 (0.01)
    expect(computeLogMax(0.0001, 0)).toBe(-2)
  })

  it('CA2: teto sobe quando um pico muito maior que o threshold é observado', () => {
    // max(0.009, 1.0) * 1.5 = 1.5 -> log10 ~ 0.176 -> ceil -> 1 (10.0)
    expect(computeLogMax(0.009, 1.0)).toBe(1)
  })

  it('CA2: resultado é sempre um inteiro (expoente de potência de 10, nunca um teto "feio")', () => {
    expect(Number.isInteger(computeLogMax(0.0137, 0.0289))).toBe(true)
  })
})
