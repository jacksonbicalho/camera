import { describe, expect, it } from 'vitest'
import {
  computeHourLayout,
  hourBoxWidthPx,
  isCoveredByRecording,
  pixelToTimeFraction,
  posToTime,
  recordingAtMs,
  spreadFractions,
  timeFractionToPixel,
  timePosFraction,
} from './timelineScale'

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

describe('spreadFractions', () => {
  it('não altera posições já espaçadas o bastante (caso comum, sem distorção)', () => {
    const result = spreadFractions(
      [
        { id: 1, frac: 0 },
        { id: 2, frac: 0.5 },
      ],
      0.03,
    )
    expect(result.get(1)).toBe(0)
    expect(result.get(2)).toBe(0.5)
  })

  it('empurra posições muito próximas pra garantir a separação mínima, sem inverter a ordem', () => {
    // 4 gravações praticamente coladas (ex.: reconexões rápidas do gravador) — sem o
    // espaçamento mínimo, todas cairiam em ~0% e pareceriam 1 linha só.
    const result = spreadFractions(
      [
        { id: 1, frac: 0.1 },
        { id: 2, frac: 0.101 },
        { id: 3, frac: 0.102 },
        { id: 4, frac: 0.103 },
      ],
      0.03,
    )
    const positions = [1, 2, 3, 4].map((id) => result.get(id)!)
    expect(positions[0]).toBe(0.1) // a mais cedo nunca muda
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1] + 0.03 - 1e-9)
    }
    // ordem cronológica preservada
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('clampa em 1 mesmo com muitas posições espremidas perto do fim da hora — SEM colidir entre si (reconciliação pra trás)', () => {
    // Um clamp ingênuo em Math.min(1, ...) faria várias dessas posições colidirem
    // exatamente em 1 (reproduzindo o mesmo bug que esta função existe pra evitar, só
    // deslocado pra borda direita) — cada posição precisa continuar DISTINTA da vizinha.
    const entries = Array.from({ length: 5 }, (_, i) => ({ id: i, frac: 0.95 + i * 0.001 }))
    const result = spreadFractions(entries, 0.03)
    const positions = entries.map(({ id }) => result.get(id)!)
    for (const pos of positions) {
      expect(pos).toBeLessThanOrEqual(1)
      expect(pos).toBeGreaterThanOrEqual(0)
    }
    expect(new Set(positions).size).toBe(positions.length)
    // ordem cronológica preservada mesmo reconciliando pra trás
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('lista vazia devolve mapa vazio', () => {
    expect(spreadFractions([], 0.03).size).toBe(0)
  })
})

describe('hourBoxWidthPx', () => {
  it('sem nenhuma linha, usa o piso mínimo', () => {
    expect(hourBoxWidthPx(0, 3, 1.5, 16, 80)).toBe(80)
  })
  it('poucas linhas (conteúdo menor que o piso) ainda usa o piso mínimo', () => {
    // 2 linhas: 2×3 + 1×1.5 + 16 = 23.5 < 80
    expect(hourBoxWidthPx(2, 3, 1.5, 16, 80)).toBe(80)
  })
  it('muitas linhas (conteúdo maior que o piso) cresce além do piso, proporcional à contagem', () => {
    // 20 linhas: 20×3 + 19×1.5 + 16 = 60 + 28.5 + 16 = 104.5
    expect(hourBoxWidthPx(20, 3, 1.5, 16, 80)).toBe(104.5)
  })
})

describe('computeHourLayout', () => {
  it('acumula offsets a partir das larguras + gap entre elas', () => {
    const layout = computeHourLayout([80, 100, 80], 12)
    expect(layout.offsets).toEqual([0, 92, 204])
    expect(layout.totalWidthPx).toBe(284) // 80+100+80 + 2×12
  })
  it('lista vazia devolve offsets vazios e largura total 0', () => {
    const layout = computeHourLayout([], 12)
    expect(layout.offsets).toEqual([])
    expect(layout.totalWidthPx).toBe(0)
  })
  it('uma única largura não soma gap nenhum', () => {
    const layout = computeHourLayout([80], 12)
    expect(layout.offsets).toEqual([0])
    expect(layout.totalWidthPx).toBe(80)
  })
})

describe('timeFractionToPixel / pixelToTimeFraction', () => {
  // 3 "horas" de larguras bem diferentes — testa o caso não-uniforme (o motivo de existir
  // além de uma simples `fração × largura total`).
  const widths = [80, 200, 80]
  const layout = computeHourLayout(widths, 10) // total = 80+200+80+20 = 380

  it('mapeia o início do dia pro pixel 0', () => {
    expect(timeFractionToPixel(0, widths, layout)).toBe(0)
  })
  it('mapeia o fim do dia pro fim do último card', () => {
    expect(timeFractionToPixel(1, widths, layout)).toBeCloseTo(380, 5)
  })
  it('mapeia o MEIO de uma hora estreita e de uma larga proporcionalmente à largura de CADA UMA — não uma fração linear do total', () => {
    // Meio da "hora" 0 (fração 1/6, já que são 3 "horas" — 0.5/3): pixel = 0 + 0.5×80 = 40.
    expect(timeFractionToPixel(0.5 / 3, widths, layout)).toBeCloseTo(40, 5)
    // Meio da "hora" 1 (fração 1.5/3): pixel = offsets[1] + 0.5×200 = 90 + 100 = 190.
    expect(timeFractionToPixel(1.5 / 3, widths, layout)).toBeCloseTo(190, 5)
  })
  it('clampa frações fora de 0..1', () => {
    expect(timeFractionToPixel(-0.5, widths, layout)).toBe(0)
    expect(timeFractionToPixel(1.5, widths, layout)).toBeCloseTo(380, 5)
  })
  it('pixelToTimeFraction é o inverso de timeFractionToPixel pros mesmos pontos', () => {
    for (const f of [0, 0.1, 1.5 / 3, 0.5, 0.99, 1]) {
      const px = timeFractionToPixel(f, widths, layout)
      expect(pixelToTimeFraction(px, widths, layout)).toBeCloseTo(f, 5)
    }
  })
  it('pixel negativo clampa pra fração 0; pixel além do total clampa pra fração 1', () => {
    expect(pixelToTimeFraction(-100, widths, layout)).toBe(0)
    expect(pixelToTimeFraction(99999, widths, layout)).toBe(1)
  })
  it('pixel exatamente num GAP entre dois cards é atribuído ao card ANTERIOR (limite direito)', () => {
    // offsets = [0, 90, 300]; hora 0 vai de 0 a 80, gap de 80 a 90 (hora 1 começa em 90).
    const px = 85 // dentro do gap entre a hora 0 e a hora 1
    const f = pixelToTimeFraction(px, widths, layout)
    // Deve cair na hora 0 (fração < 1/3), na borda direita dela (bem perto de 1/3).
    expect(f).toBeLessThanOrEqual(1 / 3)
    expect(f).toBeGreaterThan(0.9 / 3)
  })
})
