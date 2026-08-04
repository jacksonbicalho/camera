import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LabelEventsPage from './LabelEventsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA2: página de rotular eventos é acessível em rota própria e lista câmeras pra selecionar', () => {
  it('renderiza em /settings/label-events e mostra as câmeras do sistema no seletor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        if (String(url) === '/api/settings') {
          return new Response(JSON.stringify({ cameras: [{ id: 'cam1', name: 'Entrada' }] }), {
            status: 200,
          })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/settings/label-events']}>
        <LabelEventsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Entrada')).toBeTruthy()
  })
})
