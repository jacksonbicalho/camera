import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultLayout,
  loadSavedLayout,
  saveLayout,
  mergeLayoutWithCameras,
  presetLayout,
  loadSavedCols,
  saveCols,
  computeRowHeight,
  removeCameraFromLayout,
  addCameraToLayout,
  loadHiddenCameraIds,
  saveHiddenCameraIds,
  clampColsForViewport,
} from './liveViewLayout'

const STORAGE_KEY = 'liveview-layout'
const COLS_KEY = 'liveview-cols'

afterEach(() => {
  localStorage.clear()
})

describe('CA2: defaultLayout — arranjo automático em grade (12 colunas) quando não há layout salvo', () => {
  it('lista vazia → layout vazio', () => {
    expect(defaultLayout([])).toEqual([])
  })

  it('câmeras que cabem numa linha só ficam lado a lado (mesmo y, x crescente)', () => {
    const layout = defaultLayout(['cam1', 'cam2', 'cam3'])
    expect(layout).toHaveLength(3)
    expect(layout.every((t) => t.y === 0)).toBe(true)
    const xs = layout.map((t) => t.x)
    expect(new Set(xs).size).toBe(3) // todos os x distintos
    expect(layout.map((t) => t.i)).toEqual(['cam1', 'cam2', 'cam3'])
  })

  it('câmera além da 1ª linha quebra pra y maior (wrap)', () => {
    const layout = defaultLayout(['cam1', 'cam2', 'cam3', 'cam4'])
    const rows = new Set(layout.map((t) => t.y))
    expect(rows.size).toBeGreaterThan(1) // pelo menos 2 linhas distintas
    const last = layout[layout.length - 1]
    expect(last.y).toBeGreaterThan(0)
  })

  it('cada tile tem w/h positivos (ocupa espaço real no grid)', () => {
    const layout = defaultLayout(['cam1'])
    expect(layout[0].w).toBeGreaterThan(0)
    expect(layout[0].h).toBeGreaterThan(0)
  })
})

describe('CA2: loadSavedLayout/saveLayout — persistência em localStorage', () => {
  it('sem nada salvo → null', () => {
    expect(loadSavedLayout()).toBeNull()
  })

  it('saveLayout grava e loadSavedLayout lê de volta o mesmo layout', () => {
    const layout = [{ i: 'cam1', x: 0, y: 0, w: 4, h: 4 }]
    saveLayout(layout)
    expect(loadSavedLayout()).toEqual(layout)
  })

  it('JSON corrompido no localStorage → null, sem lançar exceção', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(() => loadSavedLayout()).not.toThrow()
    expect(loadSavedLayout()).toBeNull()
  })

  it('valor salvo que não é um array → null (formato inesperado, não quebra a página)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }))
    expect(loadSavedLayout()).toBeNull()
  })
})

describe('CA2: mergeLayoutWithCameras — reconcilia layout salvo com a lista atual de câmeras', () => {
  it('câmera removida (não está mais na lista atual) some do layout', () => {
    const saved = [
      { i: 'cam1', x: 0, y: 0, w: 4, h: 4 },
      { i: 'cam2', x: 4, y: 0, w: 4, h: 4 },
    ]
    const merged = mergeLayoutWithCameras(saved, ['cam1'])
    expect(merged.map((t) => t.i)).toEqual(['cam1'])
  })

  it('câmera nova (sem posição salva) entra no layout, abaixo do que já existe', () => {
    const saved = [{ i: 'cam1', x: 0, y: 0, w: 4, h: 4 }]
    const merged = mergeLayoutWithCameras(saved, ['cam1', 'cam2'])
    expect(merged.map((t) => t.i).sort()).toEqual(['cam1', 'cam2'])
    const cam1 = merged.find((t) => t.i === 'cam1')!
    const cam2 = merged.find((t) => t.i === 'cam2')!
    expect(cam1).toEqual(saved[0]) // câmera já posicionada não muda
    expect(cam2.y).toBeGreaterThanOrEqual(cam1.y + cam1.h) // nova entra abaixo
  })

  it('múltiplas câmeras novas simultâneas ficam lado a lado (sem sobrepor entre si), abaixo do que já existe', () => {
    const saved = [{ i: 'cam1', x: 0, y: 0, w: 4, h: 4 }]
    const merged = mergeLayoutWithCameras(saved, ['cam1', 'cam2', 'cam3'])
    expect(merged.map((t) => t.i).sort()).toEqual(['cam1', 'cam2', 'cam3'])
    const cam1 = merged.find((t) => t.i === 'cam1')!
    const cam2 = merged.find((t) => t.i === 'cam2')!
    const cam3 = merged.find((t) => t.i === 'cam3')!
    expect(cam2.y).toBe(cam3.y) // as duas novas ficam na mesma linha
    expect(cam2.x).not.toBe(cam3.x) // não se sobrepõem entre si
    expect(cam2.y).toBeGreaterThanOrEqual(cam1.y + cam1.h) // e abaixo da que já existia
  })

  it('sem mudança nenhuma (mesmas câmeras) devolve o layout salvo intacto', () => {
    const saved = [
      { i: 'cam1', x: 0, y: 0, w: 4, h: 4 },
      { i: 'cam2', x: 4, y: 0, w: 4, h: 4 },
    ]
    expect(mergeLayoutWithCameras(saved, ['cam1', 'cam2'])).toEqual(saved)
  })
})

describe('CA5: presetLayout — arranjo NxN (1 célula por câmera) quando o usuário escolhe um preset de layout', () => {
  it('cols=1 → uma câmera por linha (x sempre 0, y crescente)', () => {
    const layout = presetLayout(['cam1', 'cam2', 'cam3'], 1)
    expect(layout).toEqual([
      { i: 'cam1', x: 0, y: 0, w: 1, h: 1 },
      { i: 'cam2', x: 0, y: 1, w: 1, h: 1 },
      { i: 'cam3', x: 0, y: 2, w: 1, h: 1 },
    ])
  })

  it('cols=2 → 2 por linha, cada câmera ocupa exatamente 1 célula (w=1,h=1)', () => {
    const layout = presetLayout(['cam1', 'cam2', 'cam3'], 2)
    expect(layout).toEqual([
      { i: 'cam1', x: 0, y: 0, w: 1, h: 1 },
      { i: 'cam2', x: 1, y: 0, w: 1, h: 1 },
      { i: 'cam3', x: 0, y: 1, w: 1, h: 1 },
    ])
  })

  it('lista vazia → layout vazio', () => {
    expect(presetLayout([], 3)).toEqual([])
  })
})

describe('CA5: loadSavedCols/saveCols — persistência do preset de layout escolhido', () => {
  it('sem nada salvo → null', () => {
    expect(loadSavedCols()).toBeNull()
  })

  it('saveCols grava e loadSavedCols lê de volta o mesmo número', () => {
    saveCols(4)
    expect(loadSavedCols()).toBe(4)
  })

  it('valor corrompido/não numérico no localStorage → null, sem lançar exceção', () => {
    localStorage.setItem(COLS_KEY, 'not-a-number')
    expect(() => loadSavedCols()).not.toThrow()
    expect(loadSavedCols()).toBeNull()
  })

  it('valor <= 0 salvo → null (formato inválido, cai pro default)', () => {
    localStorage.setItem(COLS_KEY, '0')
    expect(loadSavedCols()).toBeNull()
  })
})

describe('CA6: computeRowHeight — grade NxN dimensionada pra caber na viewport disponível (não na largura)', () => {
  // Coluna larga o bastante pra nunca ser o fator limitante nestes casos (ver CA2 abaixo pro
  // caso em que a largura da coluna É o fator limitante — celular/poucas colunas).
  const WIDE_COLUMN = 10000

  it('divide a altura disponível (viewport - topo do grid - margem) pelo nº de linhas', () => {
    expect(computeRowHeight(800, 200, 2, WIDE_COLUMN)).toBe((800 - 200 - 16) / 2)
  })

  it('preset 1x1 (1 linha) usa toda a altura disponível numa célula só', () => {
    expect(computeRowHeight(800, 200, 1, WIDE_COLUMN)).toBe(800 - 200 - 16)
  })

  it('mais linhas → células mais baixas (mesma altura disponível dividida por mais)', () => {
    const h2 = computeRowHeight(800, 200, 2, WIDE_COLUMN)
    const h4 = computeRowHeight(800, 200, 4, WIDE_COLUMN)
    expect(h4).toBeLessThan(h2)
  })

  it('altura disponível degenerada (viewport baixa/muitas linhas) não passa do mínimo', () => {
    expect(computeRowHeight(300, 250, 4, WIDE_COLUMN)).toBe(80)
  })
})

describe('CA2: computeRowHeight — nunca distorce o tile além da proporção do vídeo (coluna estreita, celular)', () => {
  it('coluna larga o bastante: comportamento inalterado, altura vem da divisão por linhas (mesmo caso de sempre)', () => {
    expect(computeRowHeight(800, 100, 1, 2000)).toBe(800 - 100 - 16)
  })

  it('coluna estreita (1 coluna, viewport de celular): altura respeita 16:9 da coluna, não estica pra preencher a viewport', () => {
    const height = computeRowHeight(700, 60, 1, 320)
    expect(height).toBeCloseTo(320 / (16 / 9))
    expect(height).toBeLessThan(700 - 60 - 16) // não usa toda a altura disponível — ficaria distorcido
  })

  it('aspectRatio customizado é respeitado (não trava sempre em 16:9)', () => {
    const height = computeRowHeight(700, 60, 1, 320, 4 / 3)
    expect(height).toBeCloseTo(320 / (4 / 3))
  })

  it('mesmo com coluna muito estreita, nunca fica abaixo do mínimo', () => {
    expect(computeRowHeight(700, 60, 1, 50)).toBe(80)
  })
})

describe('CA7: removeCameraFromLayout/addCameraToLayout — curadoria de câmeras na tela', () => {
  it('removeCameraFromLayout tira só a entrada da câmera indicada, mantém as outras intactas', () => {
    const layout = [
      { i: 'cam1', x: 0, y: 0, w: 1, h: 1 },
      { i: 'cam2', x: 1, y: 0, w: 1, h: 1 },
    ]
    expect(removeCameraFromLayout(layout, 'cam1')).toEqual([{ i: 'cam2', x: 1, y: 0, w: 1, h: 1 }])
  })

  it('removeCameraFromLayout com id que não existe no layout devolve o layout intacto', () => {
    const layout = [{ i: 'cam1', x: 0, y: 0, w: 1, h: 1 }]
    expect(removeCameraFromLayout(layout, 'cam-inexistente')).toEqual(layout)
  })

  it('addCameraToLayout adiciona 1 célula nova abaixo do que já existe, sem sobrepor', () => {
    const layout = [
      { i: 'cam1', x: 0, y: 0, w: 1, h: 1 },
      { i: 'cam2', x: 1, y: 0, w: 1, h: 1 },
    ]
    const next = addCameraToLayout(layout, 'cam3')
    expect(next).toEqual([...layout, { i: 'cam3', x: 0, y: 1, w: 1, h: 1 }])
  })

  it('addCameraToLayout em layout vazio adiciona na primeira célula', () => {
    expect(addCameraToLayout([], 'cam1')).toEqual([{ i: 'cam1', x: 0, y: 0, w: 1, h: 1 }])
  })
})

describe('CA7: loadHiddenCameraIds/saveHiddenCameraIds — persistência de câmeras removidas da tela', () => {
  it('sem nada salvo → lista vazia', () => {
    expect(loadHiddenCameraIds()).toEqual([])
  })

  it('saveHiddenCameraIds grava e loadHiddenCameraIds lê de volta a mesma lista', () => {
    saveHiddenCameraIds(['cam1', 'cam2'])
    expect(loadHiddenCameraIds()).toEqual(['cam1', 'cam2'])
  })

  it('JSON corrompido no localStorage → lista vazia, sem lançar exceção', () => {
    localStorage.setItem('liveview-hidden', '{not valid json')
    expect(() => loadHiddenCameraIds()).not.toThrow()
    expect(loadHiddenCameraIds()).toEqual([])
  })

  it('valor salvo que não é um array → lista vazia (formato inesperado)', () => {
    localStorage.setItem('liveview-hidden', JSON.stringify({ not: 'an array' }))
    expect(loadHiddenCameraIds()).toEqual([])
  })
})

describe('CA7: mergeLayoutWithCameras — não traz de volta uma câmera explicitamente removida', () => {
  it('câmera nova E não-oculta entra normalmente (comportamento de sempre)', () => {
    const saved = [{ i: 'cam1', x: 0, y: 0, w: 4, h: 4 }]
    const merged = mergeLayoutWithCameras(saved, ['cam1', 'cam2'], [])
    expect(merged.map((t) => t.i).sort()).toEqual(['cam1', 'cam2'])
  })

  it('câmera "nova" (sem posição salva) que está na lista de ocultas NÃO entra de volta sozinha', () => {
    const saved = [{ i: 'cam1', x: 0, y: 0, w: 4, h: 4 }]
    const merged = mergeLayoutWithCameras(saved, ['cam1', 'cam2'], ['cam2'])
    expect(merged.map((t) => t.i)).toEqual(['cam1'])
  })

  it('sem hiddenIds (parâmetro omitido) mantém o comportamento anterior (compatível)', () => {
    const saved = [{ i: 'cam1', x: 0, y: 0, w: 4, h: 4 }]
    const merged = mergeLayoutWithCameras(saved, ['cam1', 'cam2'])
    expect(merged.map((t) => t.i).sort()).toEqual(['cam1', 'cam2'])
  })
})

describe('CA5: clampColsForViewport — reduz o nº de colunas do grid em viewports estreitos', () => {
  it('viewport larga (>=768px): não reduz, mantém o preset', () => {
    expect(clampColsForViewport(4, 1024)).toBe(4)
    expect(clampColsForViewport(1, 1024)).toBe(1)
  })

  it('viewport média (<768px, >=640px): no máximo 2 colunas', () => {
    expect(clampColsForViewport(4, 700)).toBe(2)
    expect(clampColsForViewport(1, 700)).toBe(1) // já era menor que o teto, não aumenta
  })

  it('viewport estreita (<640px): no máximo 1 coluna', () => {
    expect(clampColsForViewport(4, 375)).toBe(1)
    expect(clampColsForViewport(2, 375)).toBe(1)
  })

  it('nunca aumenta o nº de colunas além do preset original', () => {
    expect(clampColsForViewport(1, 1920)).toBe(1)
  })
})
