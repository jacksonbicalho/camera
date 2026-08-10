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
  s3Active = false,
  s3Available = true,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      if (u === '/api/retention-extensions' && method === 'GET') {
        return new Response(JSON.stringify(existing), { status: 200 })
      }
      if (u === '/api/settings/extensions' && method === 'GET') {
        return new Response(
          JSON.stringify([
            {
              id: 's3',
              name: 'S3',
              category: 'Retenção',
              description: 'Envia gravações expiradas para um destino S3 externo.',
              available: s3Available,
              active: s3Active,
            },
          ]),
          { status: 200 },
        )
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

    fireEvent.click(document.getElementById('s3-config-apply')!)

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

    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => {
      expect(calledMethod).toBe('PUT')
      expect(calledUrl).toBe('/api/retention-extensions/ext1')
    })
  })
})

describe('CA8: "Excluir configuração" só aparece com uma config existente, e chama DELETE ao confirmar', () => {
  it('sem nenhuma config existente, o botão "Excluir configuração" não aparece', async () => {
    mockRetentionExtensionsFetch([])
    renderPage()

    await screen.findByLabelText(/nome/i)
    expect(screen.queryByRole('button', { name: /excluir configuração/i })).toBeNull()
  })

  it('com uma config existente, confirmar a exclusão chama DELETE e volta pra lista de extensões', async () => {
    let calledMethod = ''
    let calledUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const u = String(url)
        const method = init?.method ?? 'GET'
        if (u === '/api/retention-extensions' && method === 'GET') {
          return new Response(
            JSON.stringify([
              {
                id: 'ext1',
                name: 'destino-atual',
                endpoint: '',
                bucket: 'bucket-atual',
                region: 'us-east-1',
                prefix: '',
              },
            ]),
            { status: 200 },
          )
        }
        if (u === '/api/settings/extensions' && method === 'GET') {
          return new Response(
            JSON.stringify([
              { id: 's3', name: 'S3', category: 'Retenção', available: true, active: true },
            ]),
            { status: 200 },
          )
        }
        calledMethod = method
        calledUrl = u
        return new Response(null, { status: 204 })
      }),
    )
    renderPage()

    await screen.findByDisplayValue('destino-atual')
    fireEvent.click(screen.getByRole('button', { name: /excluir configuração/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^excluir$/i }))

    await waitFor(() => {
      expect(calledMethod).toBe('DELETE')
      expect(calledUrl).toBe('/api/retention-extensions/ext1')
    })
  })
})

// CA8 (história refactor/preferencias-submenu-lateral-storage): removida a
// PreferencesExtensionsPage (lista de cards), o toggle "Ativado" do S3 não
// tinha mais nenhum lugar pra viver — passa a fazer parte desta própria
// página, independente do formulário/Aplicar/Excluir do destino S3.
describe('CA8: checkbox "Ativado" do S3 reflete o estado atual e persiste via PUT /api/settings/extensions/s3', () => {
  it('mostra o checkbox refletindo active=true vindo da API', async () => {
    mockRetentionExtensionsFetch([], undefined, true)
    renderPage()

    const checkbox = (await screen.findByRole('checkbox')) as HTMLInputElement
    await waitFor(() => expect(checkbox.checked).toBe(true))
  })

  it('alterar o checkbox e aplicar dispara PUT /api/settings/extensions/s3 com o novo valor, sem afetar o formulário de destino', async () => {
    let putBody: unknown = null
    let putUrl = ''
    mockRetentionExtensionsFetch(
      [],
      (method, url, body) => {
        if (method === 'PUT' && url === '/api/settings/extensions/s3') {
          putUrl = url
          putBody = body
        }
      },
      false,
    )
    renderPage()

    const checkbox = (await screen.findByRole('checkbox')) as HTMLInputElement
    fireEvent.click(checkbox)
    fireEvent.click(document.getElementById('s3-active-apply')!)

    await waitFor(() => {
      expect(putUrl).toBe('/api/settings/extensions/s3')
      expect(putBody).toEqual({ active: true })
    })
  })

  it('quando a extensão não está disponível, não mostra checkbox, form nem Excluir', async () => {
    mockRetentionExtensionsFetch([], undefined, false, false)
    renderPage()

    await screen.findByText('Extensão não permitida nesta instância.')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByLabelText(/^nome/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /excluir configuração/i })).toBeNull()
  })
})
