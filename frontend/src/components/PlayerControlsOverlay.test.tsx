import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import PlayerControlsOverlay from './PlayerControlsOverlay'
import type { PlayerZoom } from '../hooks/usePlayerZoom'

afterEach(cleanup)

function makeZoom(overrides: Partial<PlayerZoom> = {}): PlayerZoom {
  return {
    setContainer: vi.fn(),
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
    isZoomed: false,
    scale: 1,
    reset: vi.fn(),
    consumeDrag: vi.fn(() => false),
    ...overrides,
  }
}

describe('PlayerControlsOverlay', () => {
  it('sem zoom ativo, mostra só o botão de tela cheia', () => {
    render(<PlayerControlsOverlay id="p1" zoom={makeZoom()} onToggleFullscreen={vi.fn()} />)
    expect(document.getElementById('p1-zoom-reset')).toBeNull()
    expect(document.getElementById('p1-fullscreen')).not.toBeNull()
  })

  it('com zoom ativo, mostra o botão de reset com a escala atual', () => {
    render(<PlayerControlsOverlay id="p1" zoom={makeZoom({ isZoomed: true, scale: 2.5 })} onToggleFullscreen={vi.fn()} />)
    const btn = document.getElementById('p1-zoom-reset')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('2.5')
  })

  it('clicar no botão de reset chama zoom.reset', () => {
    const reset = vi.fn()
    render(<PlayerControlsOverlay id="p1" zoom={makeZoom({ isZoomed: true, reset })} onToggleFullscreen={vi.fn()} />)
    fireEvent.click(document.getElementById('p1-zoom-reset')!)
    expect(reset).toHaveBeenCalled()
  })

  it('clicar no botão de tela cheia chama onToggleFullscreen', () => {
    const onToggleFullscreen = vi.fn()
    render(<PlayerControlsOverlay id="p1" zoom={makeZoom()} onToggleFullscreen={onToggleFullscreen} />)
    fireEvent.click(document.getElementById('p1-fullscreen')!)
    expect(onToggleFullscreen).toHaveBeenCalled()
  })
})
