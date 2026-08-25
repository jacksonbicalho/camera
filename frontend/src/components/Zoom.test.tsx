import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach } from 'vitest'
import Zoom from './Zoom'
import type { PlayerZoom } from '../hooks/usePlayerZoom'

afterEach(cleanup)

// fakeZoom — satisfaz o contrato inteiro de PlayerZoom (usePlayerZoom.ts) com defaults
// sobrescrevíveis; Zoom.tsx só lê scale/isZoomed/canZoomIn/canZoomOut/zoomIn/zoomOut/reset,
// mas o tipo exige o objeto completo.
function fakeZoom(overrides: Partial<PlayerZoom> = {}): PlayerZoom {
  return {
    setContainer: vi.fn(),
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    isZoomed: false,
    scale: 1,
    canZoomIn: true,
    canZoomOut: false,
    reset: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    consumeDrag: vi.fn(() => false),
    ...overrides,
  }
}

describe('Zoom — componente reutilizável de controle de zoom no rodapé (− % +)', () => {
  describe('CA2: separadores visuais flanqueiam o grupo dos 3 elementos', () => {
    it('renderiza um separador (aria-hidden) antes do zoom-out e outro depois do zoom-in, agrupando os 3 elementos', () => {
      render(<Zoom id="p" zoom={fakeZoom()} />)
      const container = document.getElementById('p-zoom-out')!.parentElement!
      const children = Array.from(container.children)
      const first = children[0]
      const last = children[children.length - 1]

      expect(first).not.toBe(document.getElementById('p-zoom-out'))
      expect(first.tagName).toBe('SPAN')
      expect(first.getAttribute('aria-hidden')).toBe('true')

      expect(last).not.toBe(document.getElementById('p-zoom-in'))
      expect(last.tagName).toBe('SPAN')
      expect(last.getAttribute('aria-hidden')).toBe('true')
    })
  })

  describe('CA3: mostra o percentual atual e permite zoom in/out por clique', () => {
    it('mostra "100%" na escala 1 (sem zoom)', () => {
      render(<Zoom id="p" zoom={fakeZoom()} />)
      expect(document.getElementById('p-zoom-level')?.textContent).toBe('100%')
    })

    it('mostra o percentual arredondado da escala atual (ex.: 1.4 → 140%)', () => {
      render(<Zoom id="p" zoom={fakeZoom({ scale: 1.4, isZoomed: true, canZoomOut: true })} />)
      expect(document.getElementById('p-zoom-level')?.textContent).toBe('140%')
    })

    it('clicar em "+" chama zoom.zoomIn', () => {
      const zoom = fakeZoom()
      render(<Zoom id="p" zoom={zoom} />)
      fireEvent.click(document.getElementById('p-zoom-in')!)
      expect(zoom.zoomIn).toHaveBeenCalledTimes(1)
    })

    it('clicar em "−" chama zoom.zoomOut', () => {
      const zoom = fakeZoom({ scale: 1.4, isZoomed: true, canZoomOut: true })
      render(<Zoom id="p" zoom={zoom} />)
      fireEvent.click(document.getElementById('p-zoom-out')!)
      expect(zoom.zoomOut).toHaveBeenCalledTimes(1)
    })

    it('clicar no rótulo do percentual chama zoom.reset', () => {
      const zoom = fakeZoom({ scale: 1.4, isZoomed: true, canZoomOut: true })
      render(<Zoom id="p" zoom={zoom} />)
      fireEvent.click(document.getElementById('p-zoom-level')!)
      expect(zoom.reset).toHaveBeenCalledTimes(1)
    })

    it('sem zoom ativo (escala 1): "−" e o rótulo ficam desabilitados (canZoomOut=false, isZoomed=false); "+" fica habilitado', () => {
      render(<Zoom id="p" zoom={fakeZoom()} />)
      expect(document.getElementById('p-zoom-out')?.hasAttribute('disabled')).toBe(true)
      expect(document.getElementById('p-zoom-level')?.hasAttribute('disabled')).toBe(true)
      expect(document.getElementById('p-zoom-in')?.hasAttribute('disabled')).toBe(false)
    })

    it('no teto de zoom (canZoomIn=false): "+" fica desabilitado', () => {
      render(
        <Zoom
          id="p"
          zoom={fakeZoom({ scale: 8, isZoomed: true, canZoomIn: false, canZoomOut: true })}
        />,
      )
      expect(document.getElementById('p-zoom-in')?.hasAttribute('disabled')).toBe(true)
    })
  })

  describe('CA3 (lighthouse-hardening): aria-label do botão de zoom inclui o percentual atual', () => {
    it('escala 1 (100%) → aria-label menciona "100%"', () => {
      render(<Zoom id="p" zoom={fakeZoom()} />)
      expect(document.getElementById('p-zoom-level')?.getAttribute('aria-label')).toContain(
        '100%',
      )
    })

    it('escala 1.4 (140%) → aria-label menciona "140%"', () => {
      render(<Zoom id="p" zoom={fakeZoom({ scale: 1.4, isZoomed: true, canZoomOut: true })} />)
      expect(document.getElementById('p-zoom-level')?.getAttribute('aria-label')).toContain(
        '140%',
      )
    })
  })
})
