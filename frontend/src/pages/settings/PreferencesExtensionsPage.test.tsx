import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url)
      if (u === '/api/settings/extensions') {
        return new Response(
          JSON.stringify([
            {
              id: 'telegram',
              name: 'Telegram',
              category: 'Notificações',
              description: 'Envia notificações de movimento via Telegram.',
              available: true,
              active: true,
            },
            {
              id: 's3',
              name: 'S3',
              category: 'Retenção',
              description: 'Envia gravações expiradas para um destino S3 externo.',
              available: true,
              active: false,
            },
            {
              id: 'face-detector',
              name: 'Face Detector',
              category: 'Análise',
              description: 'Detecta rostos nas gravações da câmera.',
              available: true,
              active: false,
            },
          ]),
          { status: 200 },
        )
      }
      if (u === '/api/retention-extensions') return new Response('[]', { status: 200 })
      return new Response('{}', { status: 200 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA4/CA5: PreferencesExtensionsPage mostra o conteúdo de Telegram e S3 juntos, na mesma página', () => {
  it('renderiza o card do Telegram (com Ativado marcado) e o card do S3 (disponível), com o submenu ao lado', async () => {
    mockFetch()
    render(
      <MemoryRouter>
        <PreferencesExtensionsPage />
      </MemoryRouter>,
    )

    // Telegram: available+active — toggle ligado, sem navegar pra sub-rota.
    await screen.findByText('Telegram')
    const telegramToggle = document.getElementById('telegram-active') as HTMLElement
    expect(telegramToggle.getAttribute('aria-checked')).toBe('true')

    // S3: available — card renderiza de verdade (não a mensagem de bloqueio).
    await screen.findByText('S3')
    expect(screen.queryByText('Extensão não permitida nesta instância.')).toBeNull()

    expect(document.getElementById('preferences-nav-extensions')).toBeTruthy()
    expect(document.getElementById('preferences-nav-appearance')).toBeTruthy()
    expect(document.getElementById('preferences-nav-storage')).toBeTruthy()
  })
})

describe('CA4: PreferencesExtensionsPage renderiza o card Face Detector junto com Telegram/S3', () => {
  it('mostra o card Face Detector na página', async () => {
    mockFetch()
    render(
      <MemoryRouter>
        <PreferencesExtensionsPage />
      </MemoryRouter>,
    )

    await screen.findByText('Face Detector')
    expect(screen.queryByText('Extensão não permitida nesta instância.')).toBeNull()
  })

  it('os cards ficam lado a lado (wrapper usa grid, não empilhado em coluna)', async () => {
    mockFetch()
    render(
      <MemoryRouter>
        <PreferencesExtensionsPage />
      </MemoryRouter>,
    )

    await screen.findByText('Telegram')
    const wrapper = document.getElementById('telegram-extension-card')?.parentElement
    expect(wrapper?.className).toContain('grid')
    expect(wrapper?.className).toMatch(/grid-cols-/)
    // items-stretch explícito (não deixado no default implícito) — é o que
    // faz um card mais curto (ex.: extensão indisponível) igualar a altura
    // dos vizinhos na mesma linha do grid.
    expect(wrapper?.className).toContain('items-stretch')
  })
})
