import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

// MotionScoreChart usa useEventSource (SSE) internamente — mock raso pra isolar o teste da
// expansão do card de câmera, mesmo espírito de mockar DatePicker/Layout em outras páginas.
vi.mock('../../components/MotionScoreChart', () => ({
  default: ({ cameraId }: { cameraId: string }) => <div id={`motion-score-chart-${cameraId}`} />,
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
      // Campos que a página real sempre recebe junto (GET /api/stats devolve o
      // objeto Stats inteiro, nunca um subconjunto) — necessários pra não
      // quebrar o bloco de KPIs (Gravações/Horas gravadas/Câmeras), que
      // também depende de `stats` estar preenchido.
      recordings_count: 0,
      recordings_bytes: 0,
      recordings_duration_seconds: 0,
      camera_count: 0,
      connected_clients: 0,
      cameras: [],
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

describe('CA3: "Servidor" absorve o conteúdo de Estatísticas (KPIs + atividade por câmera), migrado de StatsPage', () => {
  it('mostra os KPIs de Gravações/Horas gravadas/Câmeras', async () => {
    mockSettings = baseSettings({})
    mockStats = {
      recordings_count: 120,
      recordings_bytes: 500_000_000,
      recordings_duration_seconds: 7500,
      camera_count: 3,
      connected_clients: 2,
      cameras: [],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve([]) })),
    )
    render(
      <MemoryRouter initialEntries={['/settings/server']}>
        <ServerSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Gravações')
      expect(document.body.textContent).toContain('120')
      expect(document.body.textContent).toContain('Horas gravadas')
      expect(document.body.textContent).toContain('2h 5m')
      expect(document.body.textContent).toContain('3')
    })
  })

  it('lista as câmeras (via /api/cameras); clique expande e mostra MotionScoreChart quando motion está ativo', async () => {
    mockSettings = baseSettings({})
    mockStats = {
      recordings_count: 0,
      recordings_bytes: 0,
      recordings_duration_seconds: 0,
      camera_count: 2,
      connected_clients: 0,
      cameras: [
        {
          id: 'cam1',
          online: true,
          motion_enabled: true,
          last_recording_at: null,
          top_motion_score: 0,
          min_motion_score: 0,
        },
        {
          id: 'cam2',
          online: false,
          motion_enabled: false,
          last_recording_at: null,
          top_motion_score: 0,
          min_motion_score: 0,
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/cameras'))
          return Promise.resolve({
            status: 200,
            json: () =>
              Promise.resolve([
                { id: 'cam1', name: 'Corredor', motion_threshold: 12 },
                { id: 'cam2', name: 'Quintal', motion_threshold: 8 },
              ]),
          })
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    render(
      <MemoryRouter initialEntries={['/settings/server']}>
        <ServerSettingsPage />
      </MemoryRouter>,
    )
    const corredorRow = await waitFor(() => {
      const el = screen.getByText('Corredor')
      return el.closest('button')!
    })
    expect(document.getElementById('motion-score-chart-cam1')).toBeNull()
    fireEvent.click(corredorRow)
    await waitFor(() => {
      expect(document.getElementById('motion-score-chart-cam1')).not.toBeNull()
    })

    const quintalRow = screen.getByText('Quintal').closest('button')!
    fireEvent.click(quintalRow)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Detecção de movimento desativada')
    })
    expect(document.getElementById('motion-score-chart-cam2')).toBeNull()
  })
})

describe('CA6: card expansível de câmera mostra as estatísticas da câmera (migrado de CameraDetailSettingsPage)', () => {
  it('ao expandir, busca GET /api/cameras/{id}/stats e mostra total gravado/segmentos/espaço/eventos', async () => {
    mockSettings = baseSettings({})
    mockStats = {
      recordings_count: 0,
      recordings_bytes: 0,
      recordings_duration_seconds: 0,
      camera_count: 1,
      connected_clients: 0,
      cameras: [
        {
          id: 'cam1',
          online: true,
          motion_enabled: false,
          last_recording_at: null,
          top_motion_score: 0,
          min_motion_score: 0,
        },
      ],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/cameras/cam1/stats')
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                total_bytes: 1_073_741_824,
                total_chunks: 42,
                total_seconds: 3600,
                total_motion_events: 7,
              }),
          })
        if (url.startsWith('/api/cameras'))
          return Promise.resolve({
            status: 200,
            json: () => Promise.resolve([{ id: 'cam1', name: 'Corredor', motion_threshold: 12 }]),
          })
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    render(
      <MemoryRouter initialEntries={['/settings/server']}>
        <ServerSettingsPage />
      </MemoryRouter>,
    )
    const corredorRow = await waitFor(() => {
      const el = screen.getByText('Corredor')
      return el.closest('button')!
    })
    fireEvent.click(corredorRow)
    await waitFor(() => {
      expect(document.getElementById('camera-stats-cam1')).not.toBeNull()
      const text = document.getElementById('camera-stats-cam1')!.textContent
      expect(text).toContain('1h')
      expect(text).toContain('42')
      expect(text).toContain('7')
    })
  })
})
