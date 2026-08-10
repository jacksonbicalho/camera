import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PreferencesExtensionsPage from './PreferencesExtensionsPage'

// PreferencesExtensionsPage.test.tsx reescrito (história
// feat/extensoes-generalizadas-s3-extensao, T4): GET /api/settings/extensions
// passa a devolver uma LISTA (id/category/description/available/active) em
// vez do objeto plano {telegram_enabled, telegram_available} — o card deixa
// de ser hardcoded pro Telegram e passa a renderizar qualquer entrada da
// lista. Card indisponível (available=false) fica opaco/bloqueado; card
// disponível mostra checkbox "Ativo" + botão "Configurar" (só quando a
// extensão tem tela própria — S3 tem, Telegram não nesta história).

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

interface ExtensionFixture {
  id: string
  name: string
  category: string
  description: string
  available: boolean
  active: boolean
}

function mockExtensionsFetch(
  list: ExtensionFixture[],
  putSpy?: (id: string, body: unknown) => void,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u === '/api/settings/extensions' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify(list), { status: 200 })
      }
      const putMatch = u.match(/^\/api\/settings\/extensions\/(.+)$/)
      if (putMatch && init?.method === 'PUT') {
        const body = init.body ? JSON.parse(String(init.body)) : null
        putSpy?.(putMatch[1], body)
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

function renderPage() {
  return render(
    <MemoryRouter>
      <PreferencesExtensionsPage />
    </MemoryRouter>,
  )
}

const telegramAvailable: ExtensionFixture = {
  id: 'telegram',
  name: 'Telegram',
  category: 'Notificações',
  description: 'Envia notificações de movimento via Telegram.',
  available: true,
  active: false,
}

const telegramUnavailable: ExtensionFixture = { ...telegramAvailable, available: false }

const s3Available: ExtensionFixture = {
  id: 's3',
  name: 'S3',
  category: 'Retenção',
  description: 'Envia gravações expiradas para um destino S3 externo.',
  available: true,
  active: true,
}

describe('CA6: card de extensão indisponível vem opaco/bloqueado, sem controles', () => {
  it('renderiza a extensão indisponível sem checkbox e sem botão Configurar', async () => {
    mockExtensionsFetch([telegramUnavailable])
    renderPage()

    const card = await screen.findByTestId('extension-card-telegram')
    expect(card.className).toMatch(/opacity-/)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /configurar/i })).toBeNull()
  })
})

describe('CA6: card de extensão disponível mostra categoria, descrição e checkbox "Ativo"', () => {
  it('mostra categoria e descrição da extensão', async () => {
    mockExtensionsFetch([telegramAvailable])
    renderPage()

    await screen.findByText('Notificações')
    await screen.findByText(telegramAvailable.description)
  })

  it('clicar no checkbox dispara PUT /api/settings/extensions/telegram com active invertido', async () => {
    let putId: string | null = null
    let putBody: unknown = null
    mockExtensionsFetch([telegramAvailable], (id, body) => {
      putId = id
      putBody = body
    })
    renderPage()

    const checkbox = await screen.findByRole('checkbox')
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(putId).toBe('telegram')
      expect(putBody).toEqual({ active: true })
    })
  })

  it('não mostra botão "Configurar" pra uma extensão sem tela própria (telegram)', async () => {
    mockExtensionsFetch([telegramAvailable])
    renderPage()

    await screen.findByTestId('extension-card-telegram')
    expect(screen.queryByRole('button', { name: /configurar/i })).toBeNull()
  })

  it('mostra botão "Configurar" pra uma extensão com tela própria (s3)', async () => {
    mockExtensionsFetch([s3Available])
    renderPage()

    await screen.findByRole('button', { name: /configurar/i })
  })
})
