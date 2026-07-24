import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StatsPage from './StatsPage'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: () => 'admin',
}))
// Mocka SettingsLayout (shallow) — isola o conteúdo da página da coluna de
// navegação/Layout real, que exigiria NotificationProvider/router completo.
vi.mock('../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const stats = {
  recordings_bytes: 0,
  recordings_count: 0,
  recordings_duration_seconds: 0,
  forecast_seconds: 0,
  disk_total_bytes: 100,
  disk_free_bytes: 50,
  camera_count: 0,
  connected_clients: 0,
  max_size_bytes: 0,
  warn_percent: 0,
  cameras: [],
  os: 'linux',
  pid: 1,
  cpu_percent: 1,
  net_mbps: 0,
  mem_rss_bytes: 0,
  sys_mem_total_bytes: 0,
  sys_mem_free_bytes: 0,
  goroutines: 1,
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StatsPage', () => {
  it('renderiza o título dentro do SettingsLayout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/stats'))
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(stats) })
        if (url.startsWith('/api/cameras'))
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
      }),
    )
    render(
      <MemoryRouter initialEntries={['/settings/stats']}>
        <StatsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Estatísticas')
    })
  })
})
