import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import S3ExtensionConfigPage from './S3ExtensionConfigPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function mockRetentionExtensionsFetch(
  existing: Array<Record<string, string>>,
  spy?: (method: string, url: string, body: unknown) => void,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      if (u === '/api/retention-extensions' && method === 'GET') {
        return new Response(JSON.stringify(existing), { status: 200 })
      }
      const body = init?.body ? JSON.parse(String(init.body)) : null
      spy?.(method, u, body)
      return new Response(JSON.stringify({ id: 'new-id', ...(body ?? {}) }), { status: 201 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <S3ExtensionConfigPage />
    </MemoryRouter>,
  )
}

describe('CA7: tela "Configurar" do S3 cria ou edita a config singleton via /api/retention-extensions', () => {
  it('sem nenhuma linha existente, "Aplicar" dispara POST /api/retention-extensions', async () => {
    let calledMethod = ''
    let calledUrl = ''
    let calledBody: unknown = null
    mockRetentionExtensionsFetch([], (method, url, body) => {
      calledMethod = method
      calledUrl = url
      calledBody = body
    })
    renderPage()

    await screen.findByLabelText(/nome/i)
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'meu-s3' } })
    fireEvent.change(screen.getByLabelText(/bucket/i), { target: { value: 'meu-bucket' } })
    fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'AK' } })
    fireEvent.change(screen.getByLabelText(/secret key/i), { target: { value: 'SK' } })

    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() => {
      expect(calledMethod).toBe('POST')
      expect(calledUrl).toBe('/api/retention-extensions')
      expect(calledBody).toMatchObject({ name: 'meu-s3', bucket: 'meu-bucket' })
    })
  })

  it('com uma linha já existente, pré-popula o form e "Aplicar" dispara PUT /api/retention-extensions/:id', async () => {
    let calledMethod = ''
    let calledUrl = ''
    mockRetentionExtensionsFetch(
      [
        {
          id: 'ext1',
          name: 'destino-atual',
          endpoint: '',
          bucket: 'bucket-atual',
          region: 'us-east-1',
          prefix: '',
        },
      ],
      (method, url) => {
        calledMethod = method
        calledUrl = url
      },
    )
    renderPage()

    const nameInput = (await screen.findByLabelText(/^nome/i)) as HTMLInputElement
    await waitFor(() => expect(nameInput.value).toBe('destino-atual'))

    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() => {
      expect(calledMethod).toBe('PUT')
      expect(calledUrl).toBe('/api/retention-extensions/ext1')
    })
  })
})
