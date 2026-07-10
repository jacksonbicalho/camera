import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import AppearanceSettingsPage from './AppearanceSettingsPage'

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', setMode: vi.fn(), theme: 'default' }),
}))

afterEach(cleanup)

describe('AppearanceSettingsPage', () => {
  it('rotula a seção do seletor de cores como "Estilo" (não "Tema")', () => {
    render(<AppearanceSettingsPage />)
    expect(screen.getByText('Estilo')).toBeTruthy()
    expect(screen.queryByText('Tema')).toBeNull()
  })

  it('não mostra mais as seções "Topo do player" nem "Sidebar" (settings mortas/redundantes)', () => {
    render(<AppearanceSettingsPage />)
    expect(screen.queryByText('Topo do player')).toBeNull()
    expect(screen.queryByText('Sidebar')).toBeNull()
  })
})
