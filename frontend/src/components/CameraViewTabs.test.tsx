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
  it('a aba INATIVA é um link pra rota correspondente', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-history')?.getAttribute('href')).toBe('/history/cam1')
    cleanup()
    renderTabs('history')
    expect(document.getElementById('camera-tab-live')?.getAttribute('href')).toBe('/live/cam1')
  })

  it('a aba ATIVA não é clicável (não é link — já é a página atual)', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-live')?.tagName).toBe('SPAN')
    expect(document.getElementById('camera-tab-live')?.hasAttribute('href')).toBe(false)
    cleanup()
    renderTabs('history')
    expect(document.getElementById('camera-tab-history')?.tagName).toBe('SPAN')
    expect(document.getElementById('camera-tab-history')?.hasAttribute('href')).toBe(false)
  })

  it('marca a aba ativa com aria-current="page"', () => {
    renderTabs('history')
    expect(document.getElementById('camera-tab-history')?.getAttribute('aria-current')).toBe('page')
    expect(document.getElementById('camera-tab-live')?.getAttribute('aria-current')).toBeNull()
  })

  it('a aba ativa vira um chip neutro (bg-surface + ring-border), a inativa não', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-live')?.className).toContain('bg-surface')
    expect(document.getElementById('camera-tab-live')?.className).toContain('ring-border')
    expect(document.getElementById('camera-tab-history')?.className).not.toContain('bg-surface')
    cleanup()
    renderTabs('history')
    expect(document.getElementById('camera-tab-history')?.className).toContain('bg-surface')
    expect(document.getElementById('camera-tab-live')?.className).not.toContain('bg-surface')
  })

  it('container em pill (rounded-full) com fundo translúcido e borda; aba inativa com hover de texto', () => {
    renderTabs('live')
    expect(document.getElementById('camera-view-tabs')?.className).toContain('rounded-full')
    expect(document.getElementById('camera-view-tabs')?.className).toContain('bg-foreground/8')
    expect(document.getElementById('camera-view-tabs')?.className).toContain('border-border')
    expect(document.getElementById('camera-tab-history')?.className).toContain('hover:text-foreground')
  })

  it('o dot de "Ao vivo" só pulsa e fica vermelho quando a aba ativa é live (status real, não decoração)', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-live-dot')?.className).toContain('animate-pulse')
    expect(document.getElementById('camera-tab-live-dot')?.className).toContain('bg-danger')
    cleanup()
    renderTabs('history')
    expect(document.getElementById('camera-tab-live-dot')?.className).not.toContain('animate-pulse')
    expect(document.getElementById('camera-tab-live-dot')?.className).toContain('bg-muted-foreground')
  })
})
