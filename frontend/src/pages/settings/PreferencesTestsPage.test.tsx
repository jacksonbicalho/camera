import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PreferencesTestsPage from './PreferencesTestsPage'

afterEach(cleanup)

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getRole: () => 'admin',
  onUnauthorized: vi.fn(),
}))

let preferences: Record<string, unknown>
let postResponses: Record<string, { status: number; text?: string }>

beforeEach(() => {
  preferences = {
    telegram_linked: true,
    telegram_active: true,
    telegram_motion_notify_enabled: true,
    push_subscribed: true,
  }
  postResponses = {
    '/api/me/telegram/test': { status: 200 },
    '/api/me/push/test': { status: 200 },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (!init || init.method === undefined) {
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve(preferences),
        })
      }
      // Erros da API são text/plain (http.Error no backend), não um
      // envelope JSON — mesma convenção usada por CameraCaptureSection/etc.
      const res = postResponses[url] ?? { status: 200 }
      return Promise.resolve({
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        text: () => Promise.resolve(res.text ?? ''),
      })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <PreferencesTestsPage />
    </MemoryRouter>,
  )
}

describe('PreferencesTestsPage', () => {
  it('CA5: os dois cards de teste aparecem habilitados quando tudo está configurado', async () => {
    renderPage()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /testar telegram/i })).toBeTruthy(),
    )
    const telegramButton = screen.getByRole('button', { name: /testar telegram/i })
    const pushButton = screen.getByRole('button', { name: /testar.*push/i })

    expect(telegramButton.closest('fieldset')?.disabled).toBe(false)
    expect(pushButton.closest('fieldset')?.disabled).toBe(false)
  })

  it('CA5: card do Telegram fica desabilitado com tooltip quando falta configuração', async () => {
    preferences = {
      telegram_linked: false,
      telegram_active: false,
      telegram_motion_notify_enabled: false,
      push_subscribed: true,
    }
    renderPage()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /testar telegram/i })).toBeTruthy(),
    )
    const telegramButton = screen.getByRole('button', { name: /testar telegram/i })
    expect(telegramButton.closest('fieldset')?.disabled).toBe(true)

    const card = telegramButton.closest('[title]')
    expect(card?.getAttribute('title')).toBeTruthy()
  })

  it('CA5: card do Web Push fica desabilitado quando não há subscription salva', async () => {
    preferences = { ...preferences, push_subscribed: false }
    renderPage()

    await waitFor(() => expect(screen.getByRole('button', { name: /testar.*push/i })).toBeTruthy())
    const pushButton = screen.getByRole('button', { name: /testar.*push/i })
    expect(pushButton.closest('fieldset')?.disabled).toBe(true)
  })

  it('CA6: clicar em Testar (Telegram) chama o endpoint e mostra sucesso', async () => {
    renderPage()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /testar telegram/i })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: /testar telegram/i }))

    await waitFor(() => expect(screen.getByText(/enviad/i)).toBeTruthy())
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/me/telegram/test',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('CA6: clicar em Testar (Web Push) com falha no servidor mostra o erro', async () => {
    postResponses['/api/me/push/test'] = {
      status: 409,
      text: 'nenhuma inscrição de push encontrada',
    }
    renderPage()

    await waitFor(() => expect(screen.getByRole('button', { name: /testar.*push/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /testar.*push/i }))

    await waitFor(() =>
      expect(screen.getByText(/nenhuma inscrição de push encontrada/i)).toBeTruthy(),
    )
  })
})
