import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TelegramLinkSection from './TelegramLinkSection'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

function mockFetch(opts: {
  linked: boolean
  linkUrl?: string
  linkStatus?: number
  unlinkStatus?: number
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u === '/api/me/preferences' && (!init || init.method === undefined)) {
        return new Response(
          JSON.stringify({ theme: 'dark', accent: 'default', telegram_linked: opts.linked }),
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
