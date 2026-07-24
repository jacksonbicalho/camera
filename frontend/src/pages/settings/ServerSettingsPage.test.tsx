import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ServerSettingsPage from './ServerSettingsPage'
import type { Settings } from '../../hooks/useSettings'

vi.mock('../../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getToken: () => 'fake',
  clearToken: vi.fn(),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

let mockSettings: Settings
vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ settings: mockSettings, reload: vi.fn() }),
}))

let mockStats: Partial<import('../../hooks/useStats').Stats> | null = null
vi.mock('../../hooks/useStats', () => ({
  useStats: () => ({ stats: mockStats, connected: mockStats !== null }),
}))

function baseSettings(over: Partial<Settings['log']>): Settings {
  return {
    timezone: 'America/Sao_Paulo',
    debug: false,
    log: {
      output: 'stdout',
      path: '',
      max_size_mb: 50,
      max_age_days: 30,
      max_backups: 10,
      compress: true,
      ...over,
    },
    server: {
      port: 8080,
      segments_path: '/data/segments',
      recordings_path: '/data/recordings',
      username: 'admin',
    },
    storage: {
      path: '',
      with_motion_minutes: 0,
      without_motion_minutes: 0,
      interval_minutes: 0,
      max_size_gb: 0,
      warn_percent: 0,
    },
    defaults: { chunk_duration: '10m', reconnect_interval: '5s' },
    cameras: [],
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  mockStats = null
})

describe('CA5: página "Servidor" consolida servidor + sistema numa página só, sem abas', () => {
  it('renderiza o título, o fuso horário e o card "Servidor web" (Porta/Usuário)', async () => {
    mockSettings = baseSettings({})
    render(
      <MemoryRouter initialEntries={['/settings/server']}>
        <ServerSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Servidor')
      expect(document.body.textContent).toContain('America/Sao_Paulo')
      expect(document.body.textContent).toContain('Servidor web')
      expect(document.body.textContent).toContain('8080')
    })
  })

  it('mostra o card "Sistema" (OS/PID/CPU/goroutines), migrado de StatsPage', async () => {
    mockSettings = baseSettings({})
    mockStats = {
      os: 'linux',
      pid: 42,
      cpu_percent: 3.5,
      mem_rss_bytes: 1024,
      sys_mem_total_bytes: 0,
      sys_mem_free_bytes: 0,
      goroutines: 12,
    }
    render(
      <MemoryRouter initialEntries={['/settings/server']}>
        <ServerSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Sistema')
      expect(document.body.textContent).toContain('linux')
      expect(document.body.textContent).toContain('42')
      expect(document.body.textContent).toContain('12')
    })
  })
})

describe('ServerSettingsPage — log rotation', () => {
  it('shows rotation fields when output is file', () => {
    mockSettings = baseSettings({
      output: 'file',
      path: '/var/log/camera',
      max_size_mb: 25,
      max_age_days: 7,
      max_backups: 3,
      compress: false,
    })
    render(
      <MemoryRouter>
        <ServerSettingsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('25 MB')).toBeTruthy()
    expect(screen.getByText('7 dias')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('desativada')).toBeTruthy()
  })

  it('hides rotation fields when output is stdout', () => {
    mockSettings = baseSettings({ output: 'stdout' })
    render(
      <MemoryRouter>
        <ServerSettingsPage />
      </MemoryRouter>,
    )
    expect(screen.queryByText('Rotaciona em')).toBeNull()
    expect(screen.queryByText('Compressão')).toBeNull()
  })
})
