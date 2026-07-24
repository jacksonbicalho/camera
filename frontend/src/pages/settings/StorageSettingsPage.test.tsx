import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StorageSettingsPage from './StorageSettingsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: () => 'admin',
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const settings = {
  timezone: 'UTC',
  debug: false,
  log: {
    output: 'stdout',
    path: '',
    max_size_mb: 0,
    max_age_days: 0,
    max_backups: 0,
    compress: false,
  },
  server: { port: 8080, segments_path: '', recordings_path: '', username: 'admin' },
  storage: {
    path: '/data',
    with_motion_minutes: 60,
    without_motion_minutes: 30,
    interval_minutes: 60,
    max_size_gb: 100,
    warn_percent: 80,
    state_history_minutes: 129600,
  },
  defaults: { chunk_duration: '10m', reconnect_interval: '5s' },
  cameras: [],
}

const stats = {
  recordings_bytes: 20_000_000_000,
  recordings_count: 10,
  recordings_duration_seconds: 3600,
  forecast_seconds: 0,
  disk_total_bytes: 100_000_000_000,
  disk_free_bytes: 50_000_000_000,
  camera_count: 1,
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

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/settings'))
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(settings) })
      if (url.startsWith('/api/drives'))
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      if (url.startsWith('/api/retention'))
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      if (url.startsWith('/api/stats'))
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(stats) })
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StorageSettingsPage', () => {
  it('renderiza o título dentro do SettingsLayout', async () => {
    stubFetch()
    render(
      <MemoryRouter initialEntries={['/settings/storage']}>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Armazenamento')
    })
  })

  it('mostra o card "Uso de disco" (Total/Gravações/Disponível), migrado de StatsPage', async () => {
    stubFetch()
    render(
      <MemoryRouter initialEntries={['/settings/storage']}>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Uso de disco')
      expect(document.body.textContent).toContain('Disponível')
    })
  })
})
