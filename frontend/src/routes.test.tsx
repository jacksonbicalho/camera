import { Suspense, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes } from 'react-router-dom'

let mockToken: string | null = 'tok'
vi.mock('./auth', () => ({
  getToken: () => mockToken,
  mustChangePassword: () => false,
}))

vi.mock('./pages/LivePage', () => ({ default: () => <div id="marker-live-page" /> }))
vi.mock('./pages/HistoryPage', () => ({ default: () => <div id="marker-history-page" /> }))
vi.mock('./pages/HistoryLandingPage', () => ({
  default: () => <div id="marker-history-landing-page" />,
}))
vi.mock('./pages/VideoBrowserPage', () => ({
  default: () => <div id="marker-video-browser-page" />,
}))
vi.mock('./pages/ReportsPage', () => ({ default: () => <div id="marker-reports-page" /> }))
vi.mock('./pages/AllCamerasPage', () => ({ default: () => <div id="marker-all-cameras-page" /> }))
vi.mock('./pages/DashboardPage', () => ({ default: () => <div id="marker-dashboard-page" /> }))

import { routes } from './routes'

afterEach(() => {
  cleanup()
  mockToken = 'tok'
})

// routes.tsx registra as páginas que usam o Layout enxuto (LivePage/HistoryPage/
// VideoBrowserPage — o CameraPage legado e `legacyRoutes` foram removidos). Este
// teste garante que a extração não mudou nenhum path nem comportamento de auth.
function renderPath(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense>
        <Routes>{routes}</Routes>
      </Suspense>
    </MemoryRouter>,
  )
}

describe('routes', () => {
  it.each([
    ['/', 'marker-all-cameras-page'],
    ['/live/cam1', 'marker-live-page'],
    ['/history', 'marker-history-landing-page'],
    ['/history/cam1', 'marker-history-page'],
    ['/history/cam1/42', 'marker-history-page'],
    ['/recording/cam1/42', 'marker-video-browser-page'],
    ['/recording/cam1/42/7', 'marker-video-browser-page'],
    ['/reports/cam1/2026-07-07/1', 'marker-reports-page'],
    ['/dashboard', 'marker-dashboard-page'],
  ])('%s renderiza a página correspondente', async (path, markerId) => {
    renderPath(path)
    await waitFor(() => {
      expect(document.getElementById(markerId)).not.toBeNull()
    })
  })

  it('CA3: /settings/stats e /stats não estão mais registradas (StatsPage removida — conteúdo migrou pra Servidor)', () => {
    // Checagem estrutural (sem renderizar): a página real precisaria de
    // providers que este arquivo não monta (NotificationContext etc.) — uma
    // asserção via DOM renderizado passaria mesmo sem a rota existir, se o
    // componente falhasse por outro motivo (falso-positivo real, confirmado
    // ao escrever este teste). Inspeciona os `path` registrados direto.
    const children = (routes as ReactElement<{ children: ReactNode }>).props.children
    const paths = (Array.isArray(children) ? children : [children])
      .filter(Boolean)
      .map((el) => (el as ReactElement<{ path?: string }>).props?.path)
    expect(paths).not.toContain('/settings/stats')
    expect(paths).not.toContain('/stats')
  })
})

describe('routes: auth', () => {
  it('sem token, rota nova não renderiza a página (RequireAuth redireciona)', async () => {
    mockToken = null
    renderPath('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('marker-history-page')).toBeNull()
    })
  })
})
