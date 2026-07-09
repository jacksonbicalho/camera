import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SystemSettingsPage from './SystemSettingsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: () => 'admin',
}))
vi.mock('../../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const settings = {
  timezone: 'America/Sao_Paulo',
  debug: false,
  log: {
    output: 'stdout',
    path: '',
    max_size_mb: 0,
    max_age_days: 0,
    max_backups: 0,
    compress: false,
  },
  server: {
    port: 8080,
    segments_path: '/data/segments',
    recordings_path: '/data/recordings',
    username: 'admin',
  },
  storage: {
    path: '/data',
    with_motion_minutes: 0,
    without_motion_minutes: 0,
    interval_minutes: 0,
    max_size_gb: 0,
    warn_percent: 0,
  },
  defaults: { chunk_duration: '10m', reconnect_interval: '5s' },
  cameras: [],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SystemSettingsPage', () => {
  it('renderiza o título e o fuso horário dentro do Layout novo (sem SettingsLayout)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(settings) }),
      ),
    )
    render(
      <MemoryRouter initialEntries={['/settings/system']}>
        <SystemSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Sistema')
      expect(document.body.textContent).toContain('America/Sao_Paulo')
    })
  })
})
