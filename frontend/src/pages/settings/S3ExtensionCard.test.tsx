import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import S3ExtensionCard from './S3ExtensionCard'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

function mockFetch(
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

describe('CA5: a página Extensões mostra o conteúdo completo do S3, junto do Telegram, num card só', () => {
  it('sem "Ativado" marcado, não mostra o formulário de destino', async () => {
    mockFetch([])
    render(<S3ExtensionCard />)

    await screen.findByText('S3')
    expect(screen.queryByLabelText(/^nome/i)).toBeNull()
  })

  it('marcar "Ativado" revela o formulário de destino', async () => {
    mockFetch([])
    render(<S3ExtensionCard />)

    const checkbox = (await screen.findByRole('checkbox')) as HTMLInputElement
    expect(screen.queryByLabelText(/^nome/i)).toBeNull()
    fireEvent.click(checkbox)
    await screen.findByLabelText(/^nome/i)
  })

  it('sem nenhuma linha existente, marcar Ativado + preencher + "Aplicar" salva o destino (POST) e ativa (PUT active=true)', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    mockFetch([], (method, url, body) => calls.push({ method, url, body }))
    render(<S3ExtensionCard />)

    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.change(await screen.findByLabelText(/^nome/i), { target: { value: 'meu-s3' } })
    fireEvent.change(screen.getByLabelText(/bucket/i), { target: { value: 'meu-bucket' } })
    fireEvent.change(screen.getByLabelText(/access key/i), { target: { value: 'AK' } })
    fireEvent.change(screen.getByLabelText(/secret key/i), { target: { value: 'SK' } })

    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => {
      const createCall = calls.find((c) => c.url === '/api/retention-extensions')
      expect(createCall?.method).toBe('POST')
      expect(createCall?.body).toMatchObject({ name: 'meu-s3', bucket: 'meu-bucket' })
      const activeCall = calls.find((c) => c.url === '/api/settings/extensions/s3')
      expect(activeCall?.method).toBe('PUT')
      expect(activeCall?.body).toEqual({ active: true })
    })
  })

  it('com uma linha já existente e já ativo, pré-popula o form; "Aplicar" dispara PUT /api/retention-extensions/:id', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    mockFetch(
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
      (method, url, body) => calls.push({ method, url, body }),
      true,
    )
    render(<S3ExtensionCard />)

    const nameInput = (await screen.findByLabelText(/^nome/i)) as HTMLInputElement
    await waitFor(() => expect(nameInput.value).toBe('destino-atual'))

    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => {
      const updateCall = calls.find((c) => c.url === '/api/retention-extensions/ext1')
      expect(updateCall?.method).toBe('PUT')
    })
  })

  it('desmarcar "Ativado" e aplicar só desativa (PUT active=false) — não mexe na config salva', async () => {
    const calls: { method: string; url: string; body: unknown }[] = []
    mockFetch(
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
      (method, url, body) => calls.push({ method, url, body }),
      true,
    )
    render(<S3ExtensionCard />)

    const checkbox = (await screen.findByRole('checkbox')) as HTMLInputElement
    await waitFor(() => expect(checkbox.checked).toBe(true))
    fireEvent.click(checkbox)
    fireEvent.click(document.getElementById('s3-config-apply')!)

    await waitFor(() => {
      const activeCall = calls.find((c) => c.url === '/api/settings/extensions/s3')
      expect(activeCall?.method).toBe('PUT')
      expect(activeCall?.body).toEqual({ active: false })
      expect(
        calls.some((c) => c.method === 'PUT' && c.url === '/api/retention-extensions/ext1'),
      ).toBe(false)
    })
  })

  it('"Excluir configuração" só aparece com uma config existente, e chama DELETE ao confirmar', async () => {
    mockFetch(
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
      undefined,
      true,
    )
    render(<S3ExtensionCard />)

    await screen.findByText('S3')
    fireEvent.click(await screen.findByRole('button', { name: /excluir configuração/i }))

    let deleteMethod = ''
    let deleteUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown, init?: RequestInit) => {
        deleteMethod = init?.method ?? 'GET'
        deleteUrl = String(url)
        return new Response(null, { status: 204 })
      }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /^excluir$/i }))

    await waitFor(() => {
      expect(deleteMethod).toBe('DELETE')
      expect(deleteUrl).toBe('/api/retention-extensions/ext1')
    })
  })

  it('sem config existente, "Excluir configuração" não aparece', async () => {
    mockFetch([])
    render(<S3ExtensionCard />)

    await screen.findByText('S3')
    expect(screen.queryByRole('button', { name: /excluir configuração/i })).toBeNull()
  })

  it('quando a extensão não está disponível, não mostra nada além do aviso', async () => {
    mockFetch([], undefined, false, false)
    render(<S3ExtensionCard />)

    await screen.findByText('Extensão não permitida nesta instância.')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('S3')).toBeNull()
  })
})
