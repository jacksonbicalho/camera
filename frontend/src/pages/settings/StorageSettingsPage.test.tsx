import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
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
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/settings/storage' && init?.method === 'PUT')
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })
      if (url === '/api/settings/extensions')
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
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
      <MemoryRouter initialEntries={['/settings/preferences/storage']}>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Armazenamento')
    })
  })

  describe('CA2: bloco de configuração inicia em modo visualização, botão "Editar" revela o formulário, salvar volta a visualizar', () => {
    it('modo visualização: sem inputs de configuração, mostra o botão Editar', async () => {
      stubFetch()
      render(
        <MemoryRouter initialEntries={['/settings/preferences/storage']}>
          <StorageSettingsPage />
        </MemoryRouter>,
      )
      await waitFor(() => {
        expect(document.getElementById('storage-edit')).toBeTruthy()
      })
      expect(document.getElementById('storage-save')).toBeNull()
      expect(document.body.textContent).toContain('/data')
    })

    it('/settings/preferences/storage/edit (deep-link direto): abre já em modo edição, sem precisar clicar', async () => {
      stubFetch()
      render(
        <MemoryRouter initialEntries={['/settings/preferences/storage/edit']}>
          <StorageSettingsPage />
        </MemoryRouter>,
      )
      await waitFor(() => {
        expect(document.getElementById('storage-save')).toBeTruthy()
      })
      expect(document.getElementById('storage-edit')).toBeNull()
    })

    it('clicar em Editar revela o formulário (botão Salvar aparece)', async () => {
      stubFetch()
      render(
        <MemoryRouter initialEntries={['/settings/preferences/storage']}>
          <StorageSettingsPage />
        </MemoryRouter>,
      )
      await waitFor(() => {
        expect(document.getElementById('storage-edit')).toBeTruthy()
      })
      fireEvent.click(document.getElementById('storage-edit')!)
      await waitFor(() => {
        expect(document.getElementById('storage-save')).toBeTruthy()
      })
    })

    it('salvar com sucesso volta ao modo visualização', async () => {
      stubFetch()
      render(
        <MemoryRouter initialEntries={['/settings/preferences/storage']}>
          <StorageSettingsPage />
        </MemoryRouter>,
      )
      await waitFor(() => {
        expect(document.getElementById('storage-edit')).toBeTruthy()
      })
      fireEvent.click(document.getElementById('storage-edit')!)
      await waitFor(() => {
        expect(document.getElementById('storage-save')).toBeTruthy()
      })
      fireEvent.click(document.getElementById('storage-save')!)
      await waitFor(() => {
        expect(document.getElementById('storage-save')).toBeNull()
        expect(document.getElementById('storage-edit')).toBeTruthy()
      })
    })

    it('cancelar descarta a edição sem chamar a API e volta ao modo visualização', async () => {
      stubFetch()
      render(
        <MemoryRouter initialEntries={['/settings/preferences/storage']}>
          <StorageSettingsPage />
        </MemoryRouter>,
      )
      await waitFor(() => {
        expect(document.getElementById('storage-edit')).toBeTruthy()
      })
      fireEvent.click(document.getElementById('storage-edit')!)
      const maxInput = await waitFor(() => {
        const input = document.querySelectorAll('input[type="number"]')[0] as HTMLInputElement
        expect(input).toBeTruthy()
        return input
      })
      fireEvent.change(maxInput, { target: { value: '999' } })
      expect(maxInput.value).toBe('999')

      fireEvent.click(document.getElementById('storage-cancel')!)
      await waitFor(() => {
        expect(document.getElementById('storage-save')).toBeNull()
        expect(document.getElementById('storage-edit')).toBeTruthy()
      })
      const putCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([url, init]: [string, RequestInit | undefined]) =>
          url === '/api/settings/storage' && init?.method === 'PUT',
      )
      expect(putCalls.length).toBe(0)

      fireEvent.click(document.getElementById('storage-edit')!)
      await waitFor(() => {
        const input = document.querySelectorAll('input[type="number"]')[0] as HTMLInputElement
        expect(input.value).toBe('100')
      })
    })
  })

  it('mostra o card "Uso de disco" (Total/Gravações/Disponível), migrado de StatsPage', async () => {
    stubFetch()
    render(
      <MemoryRouter initialEntries={['/settings/preferences/storage']}>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Uso de disco')
      expect(document.body.textContent).toContain('Disponível')
    })
  })

  // CA6/CA7 (história refactor/preferencias-submenu-lateral-storage): Armazenamento
  // vira parte de Preferências — botão "Editar" migra pro card "Configuração" e as
  // rotas passam a ser /settings/preferences/storage(/edit).
  describe('CA6: o botão "Editar" fica dentro do card "Configuração", não solto no cabeçalho', () => {
    it('storage-edit é descendente do card que contém o título "Configuração"', async () => {
      stubFetch()
      render(
        <MemoryRouter initialEntries={['/settings/preferences/storage']}>
          <StorageSettingsPage />
        </MemoryRouter>,
      )
      const editBtn = await waitFor(() => {
        const btn = document.getElementById('storage-edit')
        expect(btn).toBeTruthy()
        return btn!
      })

      const configTitle = Array.from(document.querySelectorAll('p')).find(
        (p) => p.textContent === 'Configuração',
      )
      expect(configTitle).toBeTruthy()
      const configCard = configTitle!.closest('div, section') as HTMLElement
      expect(configCard.contains(editBtn)).toBe(true)
    })
  })

  describe('CA7: rotas migram pra /settings/preferences/storage(/edit)', () => {
    it('/settings/preferences/storage/edit (deep-link direto) abre já em modo edição', async () => {
      stubFetch()
      render(
        <MemoryRouter initialEntries={['/settings/preferences/storage/edit']}>
          <StorageSettingsPage />
        </MemoryRouter>,
      )
      await waitFor(() => {
        expect(document.getElementById('storage-save')).toBeTruthy()
      })
      expect(document.getElementById('storage-edit')).toBeNull()
    })
  })
})
