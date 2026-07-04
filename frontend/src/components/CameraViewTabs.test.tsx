import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CameraViewTabs from './CameraViewTabs'

afterEach(cleanup)

function renderTabs(active: 'live' | 'history') {
  render(
    <MemoryRouter>
      <CameraViewTabs cameraId="cam1" active={active} />
    </MemoryRouter>,
  )
}

describe('CameraViewTabs', () => {
  it('Ao vivo → /live/{id} e Histórico → /history/{id}', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-live')?.getAttribute('href')).toBe('/live/cam1')
    expect(document.getElementById('camera-tab-history')?.getAttribute('href')).toBe('/history/cam1')
  })

  it('marca a aba ativa com aria-current="page"', () => {
    renderTabs('history')
    expect(document.getElementById('camera-tab-history')?.getAttribute('aria-current')).toBe('page')
    expect(document.getElementById('camera-tab-live')?.getAttribute('aria-current')).toBeNull()
  })

  it('o dot de "Ao vivo" só pulsa quando a aba ativa é live (status real, não decoração)', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-live-dot')?.className).toContain('animate-pulse')
    cleanup()
    renderTabs('history')
    expect(document.getElementById('camera-tab-live-dot')?.className).not.toContain('animate-pulse')
  })
})
