import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePlayerZoom } from './usePlayerZoom'
import { MAX_SCALE, MIN_SCALE } from '../pages/playerZoom'

describe('usePlayerZoom', () => {
  it('reset é estável entre re-renders (contrato do efeito de reset na CameraPage)', () => {
    const video = document.createElement('video')
    const { result, rerender } = renderHook(() => usePlayerZoom(() => video))
    const first = result.current.reset
    rerender()
    rerender()
    expect(result.current.reset).toBe(first)
  })

  it('começa sem zoom (escala 1) e expõe a API', () => {
    const { result } = renderHook(() => usePlayerZoom(() => null))
    expect(result.current.isZoomed).toBe(false)
    expect(result.current.scale).toBe(1)
    expect(typeof result.current.reset).toBe('function')
    expect(typeof result.current.setContainer).toBe('function')
  })

  describe('CA3: zoomIn/zoomOut — dispara o mesmo zoom do scroll, mas por clique (pro componente Zoom)', () => {
    it('começa com canZoomIn=true e canZoomOut=false (já em MIN_SCALE); zoomIn aumenta a escala em torno do centro do container e habilita canZoomOut', () => {
      const video = document.createElement('video')
      const { result } = renderHook(() => usePlayerZoom(() => video))
      act(() => {
        result.current.setContainer(document.createElement('div'))
      })
      expect(result.current.canZoomIn).toBe(true)
      expect(result.current.canZoomOut).toBe(false)
      act(() => {
        result.current.zoomIn()
      })
      expect(result.current.scale).toBeGreaterThan(MIN_SCALE)
      expect(result.current.isZoomed).toBe(true)
      expect(result.current.canZoomOut).toBe(true)
    })

    it('zoomOut desfaz o zoomIn (mesmo fator, inverso) — volta pra escala 1', () => {
      const video = document.createElement('video')
      const { result } = renderHook(() => usePlayerZoom(() => video))
      act(() => {
        result.current.setContainer(document.createElement('div'))
      })
      act(() => {
        result.current.zoomIn()
      })
      expect(result.current.scale).toBeGreaterThan(MIN_SCALE)
      act(() => {
        result.current.zoomOut()
      })
      expect(result.current.scale).toBeCloseTo(MIN_SCALE)
      expect(result.current.canZoomOut).toBe(false)
    })

    it('zoomIn repetido satura em MAX_SCALE e desliga canZoomIn — não passa do teto', () => {
      const video = document.createElement('video')
      const { result } = renderHook(() => usePlayerZoom(() => video))
      act(() => {
        result.current.setContainer(document.createElement('div'))
      })
      act(() => {
        for (let i = 0; i < 40; i++) result.current.zoomIn()
      })
      expect(result.current.scale).toBe(MAX_SCALE)
      expect(result.current.canZoomIn).toBe(false)
    })

    it('sem container ainda vinculado (setContainer nunca chamado), zoomIn/zoomOut não quebram (no-op)', () => {
      const video = document.createElement('video')
      const { result } = renderHook(() => usePlayerZoom(() => video))
      act(() => {
        result.current.zoomIn()
      })
      expect(result.current.scale).toBe(MIN_SCALE)
    })
  })
})
