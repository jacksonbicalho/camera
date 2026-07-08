import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ServerSettingsPage from './ServerSettingsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: () => 'admin',
}))
// Mocka Layout (não SettingsLayout/AppLayout) — garante que a migração pro Layout
// novo realmente aconteceu (SettingsLayout quebraria o render por falta de
// NotificationProvider).
vi.mock('../../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ServerSettingsPage', () => {
  it('renderiza o título e os dados do servidor dentro do Layout novo (sem SettingsLayout)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ server: { port: 8080, username: 'admin' } }),
    })))
    render(<MemoryRouter initialEntries={['/settings/server']}><ServerSettingsPage /></MemoryRouter>)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Servidor')
      expect(document.body.textContent).toContain('8080')
    })
  })
})
