import { describe, expect, it } from 'vitest'
import {
  cardIndexAtPixel,
  computeHourLayout,
  evenFractions,
  hourBoxWidthPx,
  nearestIdByPixel,
} from './timelineScale'

describe('evenFractions', () => {
  it('um único id ancora em 0 (sem intervalo pra distribuir)', () => {
    const result = evenFractions([1])
    expect(result.get(1)).toBe(0)
  })

  it('dois ids: o primeiro em 0, o último em 1', () => {
    const result = evenFractions([1, 2])
    expect(result.get(1)).toBe(0)
    expect(result.get(2)).toBe(1)
  })

  it('N ids: espaçamento sempre uniforme entre vizinhos, extremos em 0 e 1', () => {
    const result = evenFractions([10, 20, 30, 40, 50])
    const positions = [10, 20, 30, 40, 50].map((id) => result.get(id)!)
    expect(positions[0]).toBe(0)
    expect(positions[positions.length - 1]).toBe(1)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i] - positions[i - 1]).toBeCloseTo(0.25, 10)
    }
  })

  it('preserva a ORDEM recebida (não ordena por id) — o chamador decide a ordem cronológica', () => {
    // ids fora de ordem numérica — evenFractions só distribui pela posição na lista.
    const result = evenFractions([30, 10, 20])
    expect(result.get(30)).toBe(0)
    expect(result.get(10)).toBe(0.5)
    expect(result.get(20)).toBe(1)
  })

  it('lista vazia devolve mapa vazio', () => {
    expect(evenFractions([]).size).toBe(0)
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

describe('cardIndexAtPixel', () => {
  // 3 cards de larguras bem diferentes, gap de 10px: offsets = [0, 90, 300]; cada card vai
  // de offset até offset+largura (card 0: [0,80); card 1: [90,290); card 2: [300,380)).
  const widths = [80, 200, 80]
  const layout = computeHourLayout(widths, 10)

  it('pixel 0 cai no 1º card', () => {
    expect(cardIndexAtPixel(0, widths, layout)).toBe(0)
  })
  it('pixel dentro do 2º card cai nele', () => {
    expect(cardIndexAtPixel(150, widths, layout)).toBe(1)
  })
  it('pixel além do fim do ÚLTIMO card devolve null (fora de qualquer card — estrito, sem clamp)', () => {
    expect(cardIndexAtPixel(99999, widths, layout)).toBeNull()
  })
  it('pixel negativo devolve null (antes de qualquer card)', () => {
    expect(cardIndexAtPixel(-100, widths, layout)).toBeNull()
  })
  it('pixel exatamente num GAP entre dois cards devolve null (fora de ambos — estrito)', () => {
    // hora 0 vai de 0 a 80, gap de 80 a 90 (hora 1 começa em 90) — 85 não é de nenhum dos dois.
    expect(cardIndexAtPixel(85, widths, layout)).toBeNull()
  })
  it('lista vazia devolve null', () => {
    expect(cardIndexAtPixel(50, [], computeHourLayout([], 10))).toBeNull()
  })
})

describe('nearestIdByPixel', () => {
  it('acha o id cuja posição está mais próxima do pixel dado', () => {
    const positions = new Map([
      [1, 10],
      [2, 50],
      [3, 90],
    ])
    expect(nearestIdByPixel(positions, 45)).toBe(2)
    expect(nearestIdByPixel(positions, 12)).toBe(1)
    expect(nearestIdByPixel(positions, 89)).toBe(3)
  })

  it('empate escolhe o primeiro encontrado na iteração do Map (ordem de inserção)', () => {
    const positions = new Map([
      [1, 10],
      [2, 20],
    ])
    expect(nearestIdByPixel(positions, 15)).toBe(1)
  })

  it('mapa vazio devolve null', () => {
    expect(nearestIdByPixel(new Map(), 50)).toBeNull()
  })

  // Regressão do bug relatado pelo navigator: a posição de cada linha é por ÍNDICE
  // (`evenFractions`), não pelo horário bruto — duas gravações com horários quase idênticos
  // podem renderizar bem separadas visualmente; clicar na posição RENDERIZADA de uma linha
  // precisa selecionar ela mesma, não a vizinha mais próxima por HORÁRIO.
  it('clicar na posição RENDERIZADA de uma linha seleciona ela mesma, não a vizinha', () => {
    const positions = new Map([
      [1, 0], // "âncora"
      [2, 40], // bem separada visualmente, mesmo que o horário real seja próximo
    ])
    expect(nearestIdByPixel(positions, 40)).toBe(2)
  })
})
