import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ServerSettingsPage from './ServerSettingsPage'
import StorageSettingsPage from './StorageSettingsPage'
import CamerasSettingsPage from './CamerasSettingsPage'

afterEach(cleanup)

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('../../auth', () => ({
  getRole: vi.fn(() => 'viewer'),
  authHeaders: () => ({}),
  getToken: () => 'fake',
  clearToken: vi.fn(),
}))

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ settings: null, reload: vi.fn() }),
}))

// ServerSettingsPage/StorageSettingsPage/CamerasSettingsPage usam o
// Layout novo — mocka esse (Layout real puxaria Sidebar -> MotionNotificationsBell ->
// useNotifications(), sem provider aqui).
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}))

describe('viewer — restricted pages', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 })
  })

  it('ServerSettingsPage shows Acesso restrito for viewer', () => {
    render(
      <MemoryRouter>
        <ServerSettingsPage />
      </MemoryRouter>,
    )
    expect(screen.getAllByText('Acesso restrito.').length).toBeGreaterThan(0)
    expect(screen.queryByText('Carregando...')).toBeNull()
  })

  it('StorageSettingsPage shows Acesso restrito for viewer', () => {
    render(
      <MemoryRouter>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    expect(screen.getAllByText('Acesso restrito.').length).toBeGreaterThan(0)
    expect(screen.queryByText('Carregando...')).toBeNull()
  })
})

describe('viewer — CamerasSettingsPage', () => {
  it('CA5: fetches from /api/cameras and shows camera list as cards with Detecção/Gravando/Análise de objetos badges', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'cam1',
          name: 'Hall',
          recording_enabled: true,
          motion: { enabled: true },
          analysis_enabled: true,
        },
        { id: 'cam2', name: 'Quintal', recording_enabled: false, motion: null },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/settings/cameras']}>
        <Routes>
          <Route path="/settings/cameras" element={<CamerasSettingsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Hall')).toBeTruthy())
    expect(screen.getByText('Quintal')).toBeTruthy()

    // cam1: motion habilitado, gravando, análise de objetos habilitada — os 3 badges.
    expect(screen.getByText('Detecção')).toBeTruthy()
    expect(screen.getByText('Gravando')).toBeTruthy()
    expect(screen.getByText('Análise de objetos')).toBeTruthy()

    // cam2: motion desabilitado, não grava, sem análise — nenhum dos 3 badges (o rótulo
    // negativo antigo "rec off" não existe mais, a polaridade virou positiva).
    expect(screen.queryByText('motion')).toBeNull()
    expect(screen.queryByText('rec off')).toBeNull()

    expect(screen.queryByText(/nova câmera/i)).toBeNull()
    // viewer não vê ações de Editar/Excluir.
    expect(screen.queryByText('Editar')).toBeNull()
    expect(screen.queryByText('Excluir')).toBeNull()

    const calls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string)
    expect(calls.some((u) => u === '/api/cameras')).toBe(true)
    expect(calls.every((u: string) => u !== '/api/settings/cameras')).toBe(true)
  })

  it('shows Nenhuma câmera disponível when list is empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    })

    render(
      <MemoryRouter initialEntries={['/settings/cameras']}>
        <Routes>
          <Route path="/settings/cameras" element={<CamerasSettingsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Nenhuma câmera disponível.')).toBeTruthy()
    })
  })
})
