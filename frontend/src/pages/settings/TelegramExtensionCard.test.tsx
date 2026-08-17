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
  putStatus = 200,
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
        return new Response('{}', { status: putStatus })
      }
      return new Response('{}', { status: 200 })
    }),
  )
}

function switchChecked(el: HTMLElement) {
  return el.getAttribute('aria-checked') === 'true'
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA4: a página Extensões mostra o conteúdo do Telegram diretamente, sem sub-rota própria', () => {
  it('mostra o toggle refletindo active=true vindo da API', async () => {
    mockFetch({ available: true, active: true })
    render(<TelegramExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(true))
  })

  it('alterar o toggle e clicar "Aplicar" dispara PUT /api/settings/extensions/telegram com o novo valor', async () => {
    let putBody: unknown = null
    mockFetch({ available: true, active: false }, (body) => {
      putBody = body
    })
    render(<TelegramExtensionCard />)

    const toggle = await screen.findByRole('switch')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() => {
      expect(putBody).toEqual({ active: true })
    })
  })

  it('quando a extensão não está disponível, não mostra toggle nem Aplicar', async () => {
    mockFetch({ available: false, active: false })
    render(<TelegramExtensionCard />)

    await screen.findByText('Extensão não permitida nesta instância.')
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('button', { name: /aplicar/i })).toBeNull()
  })
})

describe('CA5: botão "Aplicar" só fica habilitado quando o valor staged diverge do salvo', () => {
  it('estado inicial: staged bate com o salvo (active=false, toggle desligado) → botão desabilitado', async () => {
    mockFetch({ available: true, active: false })
    render(<TelegramExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(false))
    const button = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('marcar o toggle (diverge do salvo) habilita o botão', async () => {
    mockFetch({ available: true, active: false })
    render(<TelegramExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(false))
    fireEvent.click(toggle)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
      expect(button.disabled).toBe(false)
    })
  })

  it('clicar Aplicar salva e desabilita o botão de novo (staged volta a bater com o salvo)', async () => {
    mockFetch({ available: true, active: false })
    render(<TelegramExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(false))
    fireEvent.click(toggle)
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
      expect(button.disabled).toBe(false)
    })

    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })
  })

  it('depois de aplicar, desmarcar de novo (voltando ao valor oposto do salvo) reabilita o botão', async () => {
    mockFetch({ available: true, active: false })
    render(<TelegramExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(false))
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })

    fireEvent.click(toggle)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
      expect(button.disabled).toBe(false)
    })
  })

  it('quando o PUT falha (status não-2xx), o botão continua habilitado (staged não foi confirmado como salvo)', async () => {
    mockFetch({ available: true, active: false }, undefined, 500)
    render(<TelegramExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(false))
    fireEvent.click(toggle)
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
      expect(button.disabled).toBe(false)
    })

    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() => {
      const button = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
      expect(button.textContent).toMatch(/aplicar/i)
    })
    const button = screen.getByRole('button', { name: /aplicar/i }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
})

describe('CA2: selo de estado salvo (ExtensionActiveToggle) reflete savedActive, não o staged', () => {
  it('o selo mostra "Desativado" no estado inicial e "Ativado" só depois de aplicar', async () => {
    mockFetch({ available: true, active: false })
    render(<TelegramExtensionCard />)

    const toggle = await screen.findByRole('switch')
    await waitFor(() => expect(switchChecked(toggle)).toBe(false))
    expect(screen.getByTestId('telegram-active-saved-badge').textContent).toBe('Desativado')

    fireEvent.click(toggle)
    expect(screen.getByTestId('telegram-active-saved-badge').textContent).toBe('Desativado')

    fireEvent.click(screen.getByRole('button', { name: /aplicar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('telegram-active-saved-badge').textContent).toBe('Ativado')
    })
  })
})
