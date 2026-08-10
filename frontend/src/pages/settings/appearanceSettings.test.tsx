import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppearanceSettingsPage from './AppearanceSettingsPage'

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', setMode: vi.fn(), theme: 'default' }),
}))

// PreferencesLayout busca /api/settings/extensions — sem esse stub, o fetch
// real tentaria conectar de verdade (ECONNREFUSED barulhento no stderr).
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// PreferencesLayout (renderizado dentro de AppearanceSettingsPage desde a
// história refactor/preferencias-submenu-lateral-storage) usa <Link> do
// react-router-dom — precisa de um Router ao redor.
function renderPage() {
  return render(
    <MemoryRouter>
      <AppearanceSettingsPage />
    </MemoryRouter>,
  )
}

describe('AppearanceSettingsPage', () => {
  it('rotula a seção do seletor de cores como "Estilo" (não "Tema")', () => {
    renderPage()
    expect(screen.getByText('Estilo')).toBeTruthy()
    expect(screen.queryByText('Tema')).toBeNull()
  })

  it('não mostra mais as seções "Topo do player" nem "Sidebar" (settings mortas/redundantes)', () => {
    renderPage()
    expect(screen.queryByText('Topo do player')).toBeNull()
    expect(screen.queryByText('Sidebar')).toBeNull()
  })
})
