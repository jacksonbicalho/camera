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

const trigger = () => document.getElementById('theme-nav-current')!

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

  it('clicar no gatilho abre as opções Light/Dark/Sistema', () => {
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    expect(document.getElementById('theme-mode-light')).toBeTruthy()
    expect(document.getElementById('theme-mode-dark')).toBeTruthy()
    expect(document.getElementById('theme-mode-system')).toBeTruthy()
  })

  it('as opções abrem num flyout portalizado (position: fixed), não clipado pelo scroll do rail', () => {
    render(<ThemeModeNav />)
    fireEvent.click(trigger())
    const flyout = document.getElementById('theme-mode-flyout')!
    expect(flyout.style.position).toBe('fixed')
    // portalizado direto no body — não é descendente do wrapper (que pode
    // estar dentro de um container com overflow, ex.: o rail).
    expect(document.getElementById('theme-mode-nav')!.contains(flyout)).toBe(false)
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

  it('hover no container abre o flyout sem precisar clicar', () => {
    render(<ThemeModeNav />)
    expect(document.getElementById('theme-mode-light')).toBeNull()
    fireEvent.mouseEnter(document.getElementById('theme-mode-nav')!)
    expect(document.getElementById('theme-mode-light')).toBeTruthy()
    expect(document.getElementById('theme-mode-dark')).toBeTruthy()
    expect(document.getElementById('theme-mode-system')).toBeTruthy()
  })

  it('sair do container (mouse leave) fecha o flyout', () => {
    render(<ThemeModeNav />)
    fireEvent.mouseEnter(document.getElementById('theme-mode-nav')!)
    expect(document.getElementById('theme-mode-light')).toBeTruthy()
    fireEvent.mouseLeave(document.getElementById('theme-mode-nav')!)
    expect(document.getElementById('theme-mode-light')).toBeNull()
  })

  it('selecionar fecha e NÃO reabre enquanto o cursor continua sobre o menu', () => {
    render(<ThemeModeNav />)
    const nav = document.getElementById('theme-mode-nav')!
    fireEvent.mouseEnter(nav)
    expect(document.getElementById('theme-mode-light')).toBeTruthy()
    fireEvent.click(document.getElementById('theme-mode-light')!)
    expect(document.getElementById('theme-mode-light')).toBeNull()
    // cursor ainda sobre o menu — não deve reabrir por hover
    fireEvent.mouseEnter(nav)
    expect(document.getElementById('theme-mode-light')).toBeNull()
  })

  it('após sair e voltar, o hover volta a abrir', () => {
    render(<ThemeModeNav />)
    const nav = document.getElementById('theme-mode-nav')!
    fireEvent.mouseEnter(nav)
    fireEvent.click(document.getElementById('theme-mode-light')!)
    fireEvent.mouseLeave(nav)
    fireEvent.mouseEnter(nav)
    expect(document.getElementById('theme-mode-light')).toBeTruthy()
  })

  it('selecionar dispara onSelect (fecha o menu de configurações pai)', () => {
    const onSelect = vi.fn()
    render(<ThemeModeNav onSelect={onSelect} />)
    fireEvent.mouseEnter(document.getElementById('theme-mode-nav')!)
    fireEvent.click(document.getElementById('theme-mode-light')!)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('posicionamento inteligente: perto do fim da viewport, o painel ancora por baixo (bottom) em vez de por cima (top)', () => {
    render(<ThemeModeNav />)
    const nav = document.getElementById('theme-mode-nav')!
    // Simula o gatilho perto do rodapé da viewport (pouco espaço abaixo dele
    // até window.innerHeight) — mesmo cenário do bug relatado pelo navigator
    // (opção "Sistema" ficava fora da tela quando "Estilo" caía no fim do rail).
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({
      top: 580,
      bottom: 600,
      left: 0,
      right: 40,
      width: 40,
      height: 20,
      x: 0,
      y: 580,
      toJSON: () => {},
    })
    fireEvent.mouseEnter(nav)
    const flyout = document.getElementById('theme-mode-flyout')!
    expect(flyout.style.top).toBe('')
    expect(flyout.style.bottom).not.toBe('')
  })

  it('posicionamento inteligente: com espaço de sobra abaixo, o painel ancora por cima (top)', () => {
    render(<ThemeModeNav />)
    const nav = document.getElementById('theme-mode-nav')!
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 120,
      left: 0,
      right: 40,
      width: 40,
      height: 20,
      x: 0,
      y: 100,
      toJSON: () => {},
    })
    fireEvent.mouseEnter(nav)
    const flyout = document.getElementById('theme-mode-flyout')!
    expect(flyout.style.bottom).toBe('')
    expect(flyout.style.top).not.toBe('')
  })
})
