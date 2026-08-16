import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TelegramLinkSection from './TelegramLinkSection'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

// FakeEventSource — mesmo padrão de UserNotificationContext.test.tsx: stub
// mínimo só com o que useEventSource usa (onmessage/close), guardando as
// instâncias criadas pra o teste disparar onmessage manualmente.
class FakeEventSource {
  static instances: FakeEventSource[] = []
  onmessage: ((e: { data: string }) => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }
  close() {}
}

function mockFetch(opts: {
  linked: boolean
  linkUrl?: string
  linkStatus?: number
  unlinkStatus?: number
  telegramUsername?: string
  telegramFirstName?: string
  telegramBotUsername?: string
}) {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u === '/api/me/preferences' && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({
            theme: 'dark',
            accent: 'default',
            telegram_linked: opts.linked,
            telegram_username: opts.telegramUsername ?? '',
            telegram_first_name: opts.telegramFirstName ?? '',
            telegram_bot_username: opts.telegramBotUsername ?? '',
          }),
          { status: 200 },
        )
      }
      if (u === '/api/me/telegram/link' && init?.method === 'POST') {
        if (opts.linkStatus && opts.linkStatus !== 200) {
          return new Response('extensão indisponível', { status: opts.linkStatus })
        }
        return new Response(
          JSON.stringify({ url: opts.linkUrl ?? 'https://t.me/os_camera_bot?start=abc123' }),
          { status: 200 },
        )
      }
      if (u === '/api/me/telegram/unlink' && init?.method === 'POST') {
        if (opts.unlinkStatus && opts.unlinkStatus !== 200) {
          return new Response('erro', { status: opts.unlinkStatus })
        }
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

describe('CA7: TelegramLinkSection mostra o botão certo por estado e dispara a ação correspondente', () => {
  it('não vinculado: mostra "Vincular"; clicar abre uma aba sincronamente e navega pra URL do deep-link quando ela chega', async () => {
    mockFetch({ linked: false, linkUrl: 'https://t.me/os_camera_bot?start=abc123' })
    const fakeWin = { location: { href: '' }, close: vi.fn() } as unknown as Window
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => fakeWin)
    render(<TelegramLinkSection />)

    const linkBtn = await screen.findByRole('button', { name: /vincular/i })
    fireEvent.click(linkBtn)

    // A aba é aberta em branco NA HORA do clique (síncrono) — antes de
    // qualquer resposta de rede, pra não ser bloqueada por popup blocker.
    expect(openSpy).toHaveBeenCalledWith('', '_blank')

    await waitFor(() => {
      expect(fakeWin.location.href).toBe('https://t.me/os_camera_bot?start=abc123')
    })
  })

  it('não vinculado: se a aba for bloqueada (window.open retorna null), mostra um link visível como alternativa', async () => {
    mockFetch({ linked: false, linkUrl: 'https://t.me/os_camera_bot?start=abc123' })
    vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<TelegramLinkSection />)

    const linkBtn = await screen.findByRole('button', { name: /vincular/i })
    fireEvent.click(linkBtn)

    const link = await screen.findByRole('link', { name: /abrir o telegram/i })
    expect(link.getAttribute('href')).toBe('https://t.me/os_camera_bot?start=abc123')
  })

  it('não vinculado: se /link falhar (ex.: extensão indisponível), mostra uma mensagem de erro em vez de falhar em silêncio', async () => {
    mockFetch({ linked: false, linkStatus: 503 })
    vi.spyOn(window, 'open').mockImplementation(() => ({ close: vi.fn() }) as unknown as Window)
    render(<TelegramLinkSection />)

    const linkBtn = await screen.findByRole('button', { name: /vincular/i })
    fireEvent.click(linkBtn)

    await screen.findByRole('alert')
  })

  it('vinculado: mostra status vinculado e "Desvincular"; clicar chama POST /api/me/telegram/unlink', async () => {
    mockFetch({ linked: true })
    render(<TelegramLinkSection />)

    const unlinkBtn = await screen.findByRole('button', { name: /desvincular/i })
    expect(screen.queryByRole('button', { name: /^vincular$/i })).toBeNull()

    fireEvent.click(unlinkBtn)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /vincular/i })).toBeTruthy()
    })
  })

  it('vinculado: se /unlink falhar, mostra uma mensagem de erro e permanece vinculado', async () => {
    mockFetch({ linked: true, unlinkStatus: 500 })
    render(<TelegramLinkSection />)

    const unlinkBtn = await screen.findByRole('button', { name: /desvincular/i })
    fireEvent.click(unlinkBtn)

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /desvincular/i })).toBeTruthy()
  })
})

describe('CA3: vinculado, mostra os dados do chat vinculado e um link "Abrir chat"', () => {
  it('mostra nome + @username, e o link "Abrir chat" aponta pro @username do bot', async () => {
    mockFetch({
      linked: true,
      telegramFirstName: 'Jane',
      telegramUsername: 'janedoe',
      telegramBotUsername: 'os_camera_bot',
    })
    render(<TelegramLinkSection />)

    await screen.findByRole('button', { name: /desvincular/i })
    expect(screen.getByText('Jane (@janedoe)')).toBeTruthy()

    const openChat = screen.getByRole('link', { name: /abrir chat/i })
    expect(openChat.getAttribute('href')).toBe('https://t.me/os_camera_bot')
  })

  it('só com first_name (sem username público), mostra só o nome', async () => {
    mockFetch({ linked: true, telegramFirstName: 'Jane', telegramBotUsername: 'os_camera_bot' })
    render(<TelegramLinkSection />)

    await screen.findByRole('button', { name: /desvincular/i })
    expect(screen.getByText('Jane')).toBeTruthy()
  })

  it('só com username (sem first_name), mostra "@username"', async () => {
    mockFetch({ linked: true, telegramUsername: 'janedoe', telegramBotUsername: 'os_camera_bot' })
    render(<TelegramLinkSection />)

    await screen.findByRole('button', { name: /desvincular/i })
    expect(screen.getByText('@janedoe')).toBeTruthy()
  })

  it('sem first_name nem username (vínculo antigo, anterior a esses campos), cai no texto genérico "Conta vinculada"', async () => {
    mockFetch({ linked: true, telegramBotUsername: 'os_camera_bot' })
    render(<TelegramLinkSection />)

    await screen.findByRole('button', { name: /desvincular/i })
    expect(screen.getByText('Conta vinculada')).toBeTruthy()
  })

  it('sem telegram_bot_username, não mostra o link "Abrir chat"', async () => {
    mockFetch({ linked: true, telegramFirstName: 'Jane' })
    render(<TelegramLinkSection />)

    await screen.findByRole('button', { name: /desvincular/i })
    expect(screen.queryByRole('link', { name: /abrir chat/i })).toBeNull()
  })

  it('não vinculado, não mostra dados de chat nem link "Abrir chat"', async () => {
    mockFetch({ linked: false, telegramBotUsername: 'os_camera_bot' })
    render(<TelegramLinkSection />)

    await screen.findByRole('button', { name: /^vincular$/i })
    expect(screen.queryByRole('link', { name: /abrir chat/i })).toBeNull()
  })
})

describe('CA4: atualiza sem reload quando o vínculo é concluído em outra aba', () => {
  it('abre EventSource em /api/notifications/live, e um evento recebido reflete o vínculo sem reload', async () => {
    const opts: {
      linked: boolean
      telegramFirstName?: string
      telegramBotUsername?: string
    } = { linked: false }
    mockFetch(opts)
    render(<TelegramLinkSection />)

    await screen.findByRole('button', { name: /^vincular$/i })
    expect(screen.queryByRole('button', { name: /desvincular/i })).toBeNull()

    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1))
    expect(FakeEventSource.instances[0].url).toContain('/api/notifications/live')

    // Simula o poller concluindo o vínculo em outra aba (Telegram) e
    // empurrando via SSE — a próxima resposta de /api/me/preferences já
    // reflete o novo estado.
    opts.linked = true
    opts.telegramFirstName = 'Jane'
    opts.telegramBotUsername = 'os_camera_bot'
    act(() => {
      FakeEventSource.instances[0].onmessage?.({ data: '{"type":"notification"}' })
    })

    await screen.findByRole('button', { name: /desvincular/i })
    expect(screen.getByText('Jane')).toBeTruthy()
  })
})
