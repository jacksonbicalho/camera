import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StorageSettingsPage from './StorageSettingsPage'

afterEach(cleanup)

vi.mock('../../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  authHeaders: () => ({}),
  getToken: () => 'fake',
  clearToken: vi.fn(),
}))

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      storage: {
        with_motion_minutes: 1440,
        without_motion_minutes: 60,
        interval_minutes: 60,
        max_size_gb: 0,
        warn_percent: 90,
        state_history_minutes: 129600,
      },
    },
    reload: vi.fn(),
  }),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

// S3 é singleton (história feat/extensoes-generalizadas-s3-extensao) — no
// máximo 1 retention_extension existe; cadastrá-la/editá-la não é mais
// responsabilidade desta página (vive em Preferências > Extensões >
// Configurar). Esta página só CONSOME a lista (0 ou 1 item) pro select "Ao
// expirar".
const extension = {
  id: 'ext-1',
  name: 'Backup S3',
  type: 's3',
  endpoint: 'https://s3.example.com',
  bucket: 'cam',
  region: 'us-east-1',
  prefix: '',
}

function putCalls() {
  return mockFetch.mock.calls.filter(
    (c: unknown[]) =>
      (c[0] as string).includes('/api/retention/') && (c[1] as RequestInit)?.method === 'PUT',
  )
}

describe('retention destination — select alimentado por /api/retention-extensions (singleton)', () => {
  it('lista "Apagar" + a extensão de retenção configurada', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/retention-extensions')
        return Promise.resolve({ ok: true, json: async () => [extension] })
      if (url === '/api/retention') return Promise.resolve({ ok: true, json: async () => [] })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(
      <MemoryRouter>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(document.getElementById('storage-edit')).toBeTruthy())
    fireEvent.click(document.getElementById('storage-edit')!)

    const destSelect = await waitFor(() => {
      const s = screen
        .getAllByRole('combobox')
        .find((el) => (el as HTMLSelectElement).value === 'delete')
      expect(s).toBeTruthy()
      return s as HTMLSelectElement
    })

    const opts = within(destSelect)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opts).toContain('Apagar')
    expect(opts).toContain('Backup S3')
  })

  it('selecionar a extensão envia send_to_drive + retention_extension_id', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/retention-extensions')
        return Promise.resolve({ ok: true, json: async () => [extension] })
      if (url === '/api/retention') return Promise.resolve({ ok: true, json: async () => [] })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(
      <MemoryRouter>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(document.getElementById('storage-edit')).toBeTruthy())
    fireEvent.click(document.getElementById('storage-edit')!)

    // Wait until the dropdown exists AND the extension option has loaded,
    // otherwise changing to a not-yet-rendered option yields an empty value (flaky).
    const destSelect = await waitFor(() => {
      const s = screen
        .getAllByRole('combobox')
        .find((el) => (el as HTMLSelectElement).value === 'delete')
      expect(s).toBeTruthy()
      expect(within(s as HTMLElement).queryByRole('option', { name: 'Backup S3' })).toBeTruthy()
      return s as HTMLSelectElement
    })

    mockFetch.mockClear()
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    fireEvent.change(destSelect, { target: { value: 'ext:ext-1' } })

    await waitFor(() => {
      const calls = putCalls()
      expect(calls.length).toBe(1)
      const body = JSON.parse((calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('send_to_drive')
      expect(body.retention_extension_id).toBe('ext-1')
    })
  })

  it('selecionar "Apagar" envia action delete', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/retention-extensions')
        return Promise.resolve({ ok: true, json: async () => [extension] })
      if (url === '/api/retention')
        return Promise.resolve({
          ok: true,
          json: async () => [
            { category: 'with_motion', action: 'send_to_drive', retention_extension_id: 'ext-1' },
          ],
        })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(
      <MemoryRouter>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(document.getElementById('storage-edit')).toBeTruthy())
    fireEvent.click(document.getElementById('storage-edit')!)

    const extSelect = await waitFor(() => {
      const s = screen
        .getAllByRole('combobox')
        .find((el) => (el as HTMLSelectElement).value === 'ext:ext-1')
      expect(s).toBeTruthy()
      return s as HTMLSelectElement
    })

    mockFetch.mockClear()
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    fireEvent.change(extSelect, { target: { value: 'delete' } })

    await waitFor(() => {
      const calls = putCalls()
      expect(calls.length).toBe(1)
      const body = JSON.parse((calls[0][1] as RequestInit).body as string)
      expect(body.action).toBe('delete')
    })
  })

  it('pré-seleciona a extensão configurada (value ext:<id>)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/retention-extensions')
        return Promise.resolve({ ok: true, json: async () => [extension] })
      if (url === '/api/retention')
        return Promise.resolve({
          ok: true,
          json: async () => [
            { category: 'with_motion', action: 'send_to_drive', retention_extension_id: 'ext-1' },
          ],
        })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(
      <MemoryRouter>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(document.getElementById('storage-edit')).toBeTruthy())
    fireEvent.click(document.getElementById('storage-edit')!)

    await waitFor(() => {
      const s = screen
        .getAllByRole('combobox')
        .find((el) => (el as HTMLSelectElement).value === 'ext:ext-1')
      expect(s).toBeTruthy()
    })
  })

  it('sem nenhuma extensão configurada, o select só lista "Apagar"', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/retention-extensions')
        return Promise.resolve({ ok: true, json: async () => [] })
      if (url === '/api/retention') return Promise.resolve({ ok: true, json: async () => [] })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    render(
      <MemoryRouter>
        <StorageSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(document.getElementById('storage-edit')).toBeTruthy())
    fireEvent.click(document.getElementById('storage-edit')!)

    const destSelect = await waitFor(() => {
      const s = screen
        .getAllByRole('combobox')
        .find((el) => (el as HTMLSelectElement).value === 'delete')
      expect(s).toBeTruthy()
      return s as HTMLSelectElement
    })
    const opts = within(destSelect)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opts).toEqual(['Apagar'])
  })
})
