import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TelegramExtensionCard from './TelegramExtensionCard'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

function mockFetch(
  telegram: { available: boolean; active: boolean },
  putSpy?: (body: unknown) => void,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u === '/api/settings/extensions' && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify([
            {
              id: 'telegram',
              name: 'Telegram',
              category: 'Notificações',
              description: 'Envia notificações de movimento via Telegram.',
              available: telegram.available,
              active: telegram.active,
            },
          ]),
          { status: 200 },
        )
      }
      if (u === '/api/settings/extensions/telegram' && init?.method === 'PUT') {
        const body = init.body ? JSON.parse(String(init.body)) : null
        putSpy?.(body)
        return new Response('{}', { status: 200 })
      }
      return new Response('{}', { status: 200 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA4: a página Extensões mostra o conteúdo do Telegram diretamente, sem sub-rota própria', () => {
  it('mostra o checkbox refletindo active=true vindo da API', async () => {
    mockFetch({ available: true, active: true })
    render(<TelegramExtensionCard />)

    const checkbox = (await screen.findByRole('checkbox')) as HTMLInputElement
    await waitFor(() => expect(checkbox.checked).toBe(true))
  })

  it('alterar o checkbox e clicar "Aplicar" dispara PUT /api/settings/extensions/telegram com o novo valor', async () => {
    let putBody: unknown = null
    mockFetch({ available: true, active: false }, (body) => {
      putBody = body
    })
    render(<TelegramExtensionCard />)

    const checkbox = (await screen.findByRole('checkbox')) as HTMLInputElement
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() => {
      expect(putBody).toEqual({ active: true })
    })
  })

  it('quando a extensão não está disponível, não mostra checkbox nem Aplicar', async () => {
    mockFetch({ available: false, active: false })
    render(<TelegramExtensionCard />)

    await screen.findByText('Extensão não permitida nesta instância.')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /aplicar/i })).toBeNull()
  })
})
