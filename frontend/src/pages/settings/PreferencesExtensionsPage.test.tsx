import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PreferencesExtensionsPage from './PreferencesExtensionsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function mockFetch({
  telegramAvailable = true,
  telegramEnabled = false,
  putSpy,
}: {
  telegramAvailable?: boolean
  telegramEnabled?: boolean
  putSpy?: (body: unknown) => void
} = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u === '/api/settings/extensions') {
        if (init?.method === 'PUT') {
          const body = init.body ? JSON.parse(String(init.body)) : null
          putSpy?.(body)
          return new Response(
            JSON.stringify({
              telegram_enabled: body?.telegram_enabled ?? telegramEnabled,
              telegram_available: telegramAvailable,
            }),
            { status: 200 },
          )
        }
        return new Response(
          JSON.stringify({
            telegram_enabled: telegramEnabled,
            telegram_available: telegramAvailable,
          }),
          { status: 200 },
        )
      }
      return new Response('{}', { status: 200 })
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
      <PreferencesExtensionsPage />
    </MemoryRouter>,
  )
}

describe('CA6: card Telegram só aparece quando disponível e alterna telegram_enabled via PUT', () => {
  it('mostra o card Telegram quando telegram_available é true', async () => {
    mockFetch({ telegramAvailable: true })
    renderPage()

    await screen.findByText(/telegram/i)
  })

  it('não mostra o card Telegram quando telegram_available é false', async () => {
    mockFetch({ telegramAvailable: false })
    renderPage()

    await screen.findByText(/preferências/i)
    expect(screen.queryByText(/telegram/i)).toBeNull()
  })

  it('clicar no checkbox dispara PUT /api/settings/extensions com telegram_enabled invertido', async () => {
    let putBody: unknown = null
    mockFetch({
      telegramAvailable: true,
      telegramEnabled: false,
      putSpy: (b) => {
        putBody = b
      },
    })
    renderPage()

    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(putBody).toEqual({ telegram_enabled: true })
    })
  })
})

describe('CA8: card do Telegram não repete o cabeçalho/descrição genéricos de "Extensões"', () => {
  it('não mostra mais o parágrafo "Integrações que podem ser ativadas para esta instância." dentro do card', async () => {
    mockFetch({ telegramAvailable: true })
    renderPage()

    await screen.findByText(/telegram/i)
    expect(screen.queryByText(/integrações que podem ser ativadas/i)).toBeNull()
  })
})
