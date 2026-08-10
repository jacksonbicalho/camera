import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppearanceSettingsPage from './AppearanceSettingsPage'

// PreferencesLayout (renderizado dentro de AppearanceSettingsPage desde a
// história refactor/preferencias-submenu-lateral-storage) busca
// /api/settings/extensions — sem esse stub, o fetch real tentaria conectar
// de verdade (ECONNREFUSED barulhento no stderr do teste).
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

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const setAccent = vi.fn()
const setMode = vi.fn()

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', setMode, theme: 'default', accent: 'teal', setAccent }),
}))

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

describe('AppearanceSettingsPage — Cor de destaque', () => {
  it('renders 5 accent swatches in a radiogroup', () => {
    renderPage()
    const group = screen.getByRole('radiogroup', { name: /cor de destaque/i })
    const swatches = screen.getAllByRole('radio', { name: /azul|violeta|teal|coral|âmbar/i })
    expect(swatches).toHaveLength(5)
    expect(group).toBeTruthy()
  })

  it('marks the current accent swatch as checked and shows the check icon', () => {
    renderPage()
    const active = screen.getByRole('radio', { name: /teal/i })
    expect(active.getAttribute('aria-checked')).toBe('true')
    expect(active.querySelector('svg')).not.toBeNull()

    const inactive = screen.getByRole('radio', { name: /coral/i })
    expect(inactive.getAttribute('aria-checked')).toBe('false')
    expect(inactive.querySelector('svg')).toBeNull()
  })

  it('clicking a swatch calls setAccent with that color', () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /coral/i }))
    expect(setAccent).toHaveBeenCalledWith('coral')
  })

  it('clicking the "azul" swatch calls setAccent with "default"', () => {
    renderPage()
    fireEvent.click(screen.getByRole('radio', { name: /azul/i }))
    expect(setAccent).toHaveBeenCalledWith('default')
  })

  it('escopa a cor do swatch "azul" (default) via data-accent, mesmo com outro accent ativo', () => {
    renderPage()
    const azul = screen.getByRole('radio', { name: /azul/i })
    expect(azul.getAttribute('data-accent')).toBe('default')
  })
})
