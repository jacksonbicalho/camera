import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppearanceSettingsPage from './AppearanceSettingsPage'

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', setMode: vi.fn(), theme: 'default' }),
}))

afterEach(cleanup)

// PreferencesTabs (renderizado dentro de AppearanceSettingsPage desde a
// história refactor/mover-appearance-preferencias) usa <Link> do
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
