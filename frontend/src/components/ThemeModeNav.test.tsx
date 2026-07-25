import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ThemeModeNav from './ThemeModeNav'

const setMode = vi.fn()
let currentMode: 'dark' | 'light' | 'system' = 'dark'
let osDark = true

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: currentMode, setMode, theme: 'default' }),
  resolveMode: (m: 'dark' | 'light' | 'system') =>
    m === 'system' ? (osDark ? 'dark' : 'light') : m,
}))

afterEach(() => {
  cleanup()
  setMode.mockClear()
  currentMode = 'dark'
  osDark = true
})

const trigger = () => document.getElementById('color-mode')!

describe('ThemeModeNav', () => {
  it('colapsado: o gatilho mostra só o rótulo "Estilo" (sem o modo) e as opções ficam ocultas', () => {
    currentMode = 'dark'
    render(<ThemeModeNav />)
    expect(trigger().textContent).toContain('Estilo')
    expect(trigger().textContent).not.toContain('Dark')
    expect(document.getElementById('theme-mode-light')).toBeNull()
    expect(document.getElementById('theme-mode-system')).toBeNull()
  })

  it('o ícone do gatilho reflete o modo resolvido: lua no dark, sol no light', () => {
    currentMode = 'dark'
    const { rerender } = render(<ThemeModeNav />)
    expect(trigger().querySelectorAll('svg circle').length).toBe(0) // lua não tem <circle>

    currentMode = 'light'
    rerender(<ThemeModeNav />)
    expect(trigger().querySelectorAll('svg circle').length).toBeGreaterThan(0) // sol tem <circle>
  })

  it('com "Sistema" escolhido: o ✓ da opção reflete "Sistema" (independe do SO)', () => {
    currentMode = 'system'
    osDark = true
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    expect(document.getElementById('theme-mode-system')!.getAttribute('aria-current')).toBe('true')
    expect(document.getElementById('theme-mode-dark')!.getAttribute('aria-current')).toBeNull()
    expect(document.getElementById('theme-mode-light')!.getAttribute('aria-current')).toBeNull()
  })

  it('"Sistema" continua sendo uma opção selecionável', () => {
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    fireEvent.click(document.getElementById('theme-mode-system')!)
    expect(setMode).toHaveBeenCalledWith('system')
  })

  it('não exibe rótulos "Modo" nem "Tema"', () => {
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    expect(screen.queryByText('Modo')).toBeNull()
    expect(screen.queryByText('Tema')).toBeNull()
  })

  it('clicar no gatilho abre as opções Light/Dark/Sistema; clicar de novo fecha', () => {
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    expect(document.getElementById('theme-mode-light')).toBeTruthy()
    expect(document.getElementById('theme-mode-dark')).toBeTruthy()
    expect(document.getElementById('theme-mode-system')).toBeTruthy()

    fireEvent.click(trigger())
    expect(document.getElementById('theme-mode-light')).toBeNull()
  })

  it('as opções abrem num flyout portalizado (position: fixed), direto no body', () => {
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    const flyout = document.getElementById('theme-mode-flyout')!
    expect(flyout.style.position).toBe('fixed')
    expect(flyout.parentElement).toBe(document.body)
  })

  it('clicar fora fecha o flyout (sem depender de hover/mouseleave)', () => {
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    expect(document.getElementById('theme-mode-light')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(document.getElementById('theme-mode-light')).toBeNull()
  })

  it('selecionar uma opção aplica o modo e fecha a lista', () => {
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    fireEvent.click(document.getElementById('theme-mode-light')!)
    expect(setMode).toHaveBeenCalledWith('light')
    // lista fecha após selecionar
    expect(document.getElementById('theme-mode-light')).toBeNull()
  })

  it('marca a opção ativa com aria-current', () => {
    currentMode = 'light'
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    expect(document.getElementById('theme-mode-light')!.getAttribute('aria-current')).toBe('true')
    expect(document.getElementById('theme-mode-dark')!.getAttribute('aria-current')).toBeNull()
    expect(document.getElementById('theme-mode-system')!.getAttribute('aria-current')).toBeNull()
  })

  it('painel ancora abaixo-à-direita do gatilho (mesmo padrão do UserMenu/MotionNotificationsBell/AppHelpMenu) — evita vazar a viewport quando o gatilho fica perto da borda direita, caso da TopBar', () => {
    render(<ThemeModeNav />)
    const btn = trigger()
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({
      top: 10,
      bottom: 30,
      left: 1150,
      right: 1190,
      width: 40,
      height: 20,
      x: 1150,
      y: 10,
      toJSON: () => {},
    })
    fireEvent.click(btn)
    const flyout = document.getElementById('theme-mode-flyout')!
    expect(flyout.style.top).toBe('38px')
    expect(flyout.style.right).toBe('10px')
    expect(flyout.style.left).toBe('')
    expect(flyout.style.bottom).toBe('')
  })
})
