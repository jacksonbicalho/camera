import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import CameraViewTabs from './CameraViewTabs'

afterEach(cleanup)

function renderTabs(active: 'live' | 'history') {
  render(
    <MemoryRouter>
      <CameraViewTabs cameraId="cam1" active={active} />
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe" data-pathname={location.pathname} />
}

function renderTabsWithRouting(active: 'live' | 'history') {
  render(
    <MemoryRouter initialEntries={[active === 'live' ? '/live/cam1' : '/history/cam1']}>
      <LocationProbe />
      <Routes>
        <Route path="/live/:cameraId" element={<CameraViewTabs cameraId="cam1" active="live" />} />
        <Route
          path="/history/:cameraId"
          element={<CameraViewTabs cameraId="cam1" active="history" />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CameraViewTabs', () => {
  it('a aba INATIVA é um link pra rota correspondente', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-history')?.getAttribute('href')).toBe(
      '/history/cam1',
    )
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

  it('a aba ativa fica com texto em destaque (foreground), a inativa não', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-live')?.className).toContain('text-foreground')
    expect(document.getElementById('camera-tab-history')?.className).toContain(
      'text-muted-foreground',
    )
    cleanup()
    renderTabs('history')
    expect(document.getElementById('camera-tab-history')?.className).toContain('text-foreground')
    expect(document.getElementById('camera-tab-live')?.className).toContain('text-muted-foreground')
  })

  it('container é a trilha (rounded-full, fundo translúcido, borda); aba inativa com hover de texto', () => {
    renderTabs('live')
    expect(document.getElementById('camera-view-tabs')?.className).toContain('rounded-full')
    expect(document.getElementById('camera-view-tabs')?.className).toContain('bg-foreground/8')
    expect(document.getElementById('camera-view-tabs')?.className).toContain('border-border')
    expect(document.getElementById('camera-tab-history')?.className).toContain(
      'hover:text-foreground',
    )
  })

  it('trilha com altura fixa (h-7, um pouco menor que os botões h-8 do rodapé do player) e rótulos que preenchem essa altura', () => {
    renderTabs('live')
    expect(document.getElementById('camera-view-tabs')?.className).toContain('h-7')
    expect(document.getElementById('camera-tab-live')?.className).toContain('h-full')
    expect(document.getElementById('camera-tab-history')?.className).toContain('h-full')
  })

  it('a pílula deslizante (glider) existe e desliza via translateX conforme a aba ativa', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-glider')?.style.transform).toBe('translateX(0%)')
    cleanup()
    renderTabs('history')
    expect(document.getElementById('camera-tab-glider')?.style.transform).toBe('translateX(100%)')
  })

  it('o dot de "Ao vivo" só pulsa e fica verde quando a aba ativa é live (status real, não decoração; vermelho fica reservado pro REC)', () => {
    renderTabs('live')
    expect(document.getElementById('camera-tab-live-dot')?.className).toContain('animate-pulse')
    expect(document.getElementById('camera-tab-live-dot')?.className).toContain('bg-success')
    cleanup()
    renderTabs('history')
    expect(document.getElementById('camera-tab-live-dot')?.className).not.toContain('animate-pulse')
    expect(document.getElementById('camera-tab-live-dot')?.className).toContain(
      'bg-muted-foreground',
    )
  })

  it('clicar na aba inativa desliza o glider de imediato e só navega depois (dá tempo da animação aparecer)', () => {
    vi.useFakeTimers()
    try {
      renderTabsWithRouting('live')
      fireEvent.click(document.getElementById('camera-tab-history')!)
      // Glider já deslizou no clique, antes de qualquer navegação.
      expect(document.getElementById('camera-tab-glider')?.style.transform).toBe('translateX(100%)')
      expect(
        document.querySelector('[data-testid="location-probe"]')?.getAttribute('data-pathname'),
      ).toBe('/live/cam1')
      act(() => {
        vi.runAllTimers()
      })
      expect(
        document.querySelector('[data-testid="location-probe"]')?.getAttribute('data-pathname'),
      ).toBe('/history/cam1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('clicar na aba inativa navega pra rota certa (fim a fim, sem fake timers)', async () => {
    renderTabsWithRouting('live')
    fireEvent.click(document.getElementById('camera-tab-history')!)
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="location-probe"]')?.getAttribute('data-pathname'),
      ).toBe('/history/cam1')
    })
  })
})
