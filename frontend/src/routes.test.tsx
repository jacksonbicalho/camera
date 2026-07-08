import { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes } from 'react-router-dom'

let mockToken: string | null = 'tok'
vi.mock('./auth', () => ({
  getToken: () => mockToken,
  mustChangePassword: () => false,
}))

vi.mock('./pages/CameraPage', () => ({ default: () => <div id="marker-camera-page" /> }))
vi.mock('./pages/LivePage', () => ({ default: () => <div id="marker-live-page" /> }))
vi.mock('./pages/HistoryPage', () => ({ default: () => <div id="marker-history-page" /> }))
vi.mock('./pages/VideoBrowserPage', () => ({ default: () => <div id="marker-video-browser-page" /> }))
vi.mock('./pages/ReportsPage', () => ({ default: () => <div id="marker-reports-page" /> }))
vi.mock('./pages/AllCamerasPage', () => ({ default: () => <div id="marker-all-cameras-page" /> }))
vi.mock('./pages/DashboardPage', () => ({ default: () => <div id="marker-dashboard-page" /> }))

import { newRoutes, legacyRoutes } from './routes'

afterEach(() => {
  cleanup()
  mockToken = 'tok'
})

// routes.tsx separa as rotas "novas" (LivePage/HistoryPage/VideoBrowserPage — refatoração de
// simplificação em andamento) das "legadas" (CameraPage, candidatas a remoção futura). Este
// teste garante que a extração não mudou nenhum path nem comportamento de auth.
function renderPath(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense>
        <Routes>
          {newRoutes}
          {legacyRoutes}
        </Routes>
      </Suspense>
    </MemoryRouter>,
  )
}

describe('routes: newRoutes', () => {
  it.each([
    ['/', 'marker-all-cameras-page'],
    ['/live/cam1', 'marker-live-page'],
    ['/history/cam1', 'marker-history-page'],
    ['/history/cam1/42', 'marker-history-page'],
    ['/recording/cam1/42', 'marker-video-browser-page'],
    ['/recording/cam1/42/7', 'marker-video-browser-page'],
    ['/reports/cam1/2026-07-07/1', 'marker-reports-page'],
    ['/dashboard', 'marker-dashboard-page'],
  ])('%s renderiza a página nova correspondente', async (path, markerId) => {
    renderPath(path)
    await waitFor(() => {
      expect(document.getElementById(markerId)).not.toBeNull()
    })
  })
})

describe('routes: legacyRoutes', () => {
  it.each([
    ['/cameras/cam1', 'marker-camera-page'],
    ['/camera/live/cam1', 'marker-camera-page'],
    ['/camera/recording/cam1/42', 'marker-camera-page'],
  ])('%s renderiza o CameraPage legado', async (path, markerId) => {
    renderPath(path)
    await waitFor(() => {
      expect(document.getElementById(markerId)).not.toBeNull()
    })
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
