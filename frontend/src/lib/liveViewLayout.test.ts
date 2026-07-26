import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultLayout,
  loadSavedLayout,
  saveLayout,
  mergeLayoutWithCameras,
} from './liveViewLayout'

const STORAGE_KEY = 'liveview-layout'

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
