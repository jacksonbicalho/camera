import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StorageSettingsPage from './StorageSettingsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: () => 'admin',
}))
vi.mock('../../components/Layout', () => ({
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
  },
  defaults: { chunk_duration: '10m', reconnect_interval: '5s' },
  cameras: [],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('StorageSettingsPage', () => {
  it('renderiza o título dentro do Layout novo (sem SettingsLayout)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/settings'))
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(settings) })
        if (url.startsWith('/api/drives'))
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        if (url.startsWith('/api/retention'))
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
      }),
    )
    render(
      <MemoryRouter initialEntries={['/settings/storage']}>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Armazenamento')
    })
  })
})
