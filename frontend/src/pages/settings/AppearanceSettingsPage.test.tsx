import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AppearanceSettingsPage from './AppearanceSettingsPage'

afterEach(() => {
  cleanup()
})

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../contexts/DisplayModeContext', () => ({
  useDisplayMode: () => ({ sidebar: 'icons-text', player: 'icons-text' }),
  useSetDisplayMode: () => vi.fn(),
}))

const setAccent = vi.fn()
const setMode = vi.fn()

vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', setMode, theme: 'default', accent: 'teal', setAccent }),
}))

describe('AppearanceSettingsPage — Cor de destaque', () => {
  it('renders 5 accent swatches in a radiogroup', () => {
    render(<AppearanceSettingsPage />)
    const group = screen.getByRole('radiogroup', { name: /cor de destaque/i })
    const swatches = screen.getAllByRole('radio', { name: /azul|violeta|teal|coral|âmbar/i })
    expect(swatches).toHaveLength(5)
    expect(group).toBeTruthy()
  })

  it('marks the current accent swatch as checked and shows the check icon', () => {
    render(<AppearanceSettingsPage />)
    const active = screen.getByRole('radio', { name: /teal/i })
    expect(active.getAttribute('aria-checked')).toBe('true')
    expect(active.querySelector('svg')).not.toBeNull()

    const inactive = screen.getByRole('radio', { name: /coral/i })
    expect(inactive.getAttribute('aria-checked')).toBe('false')
    expect(inactive.querySelector('svg')).toBeNull()
  })

  it('clicking a swatch calls setAccent with that color', () => {
    render(<AppearanceSettingsPage />)
    fireEvent.click(screen.getByRole('radio', { name: /coral/i }))
    expect(setAccent).toHaveBeenCalledWith('coral')
  })

  it('clicking the "azul" swatch calls setAccent with "default"', () => {
    render(<AppearanceSettingsPage />)
    fireEvent.click(screen.getByRole('radio', { name: /azul/i }))
    expect(setAccent).toHaveBeenCalledWith('default')
  })
})
