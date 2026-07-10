import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ServerSettingsPage from './ServerSettingsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: () => 'admin',
}))
// Mocka SettingsLayout (shallow) — isola o conteúdo da página da coluna de
// navegação/Layout real, que exigiria NotificationProvider/router completo.
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ServerSettingsPage', () => {
  it('renderiza o título e os dados do servidor dentro do SettingsLayout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ server: { port: 8080, username: 'admin' } }),
        }),
      ),
    )
    render(
      <MemoryRouter initialEntries={['/settings/server']}>
        <ServerSettingsPage />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('Servidor')
      expect(document.body.textContent).toContain('8080')
    })
  })
})
