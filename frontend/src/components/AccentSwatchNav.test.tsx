import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import AccentSwatchNav from './AccentSwatchNav'

const setAccent = vi.fn()
let currentAccent = 'default'

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ accent: currentAccent, setAccent }),
}))

afterEach(() => {
  cleanup()
  setAccent.mockClear()
  currentAccent = 'default'
})

describe('AccentSwatchNav', () => {
  it('mostra as 5 opções de cor de destaque como swatches', () => {
    render(<AccentSwatchNav />)
    for (const value of ['default', 'violet', 'teal', 'coral', 'amber']) {
      expect(document.getElementById(`accent-swatch-${value}`)).toBeTruthy()
    }
  })

  it('clicar num swatch chama setAccent com o valor certo', () => {
    render(<AccentSwatchNav />)
    fireEvent.click(document.getElementById('accent-swatch-violet')!)
    expect(setAccent).toHaveBeenCalledWith('violet')
  })

  it('marca o swatch atual com aria-checked e um ✓', () => {
    currentAccent = 'teal'
    render(<AccentSwatchNav />)
    expect(document.getElementById('accent-swatch-teal')?.getAttribute('aria-checked')).toBe('true')
    expect(document.getElementById('accent-swatch-default')?.getAttribute('aria-checked')).toBe('false')
    expect(document.getElementById('accent-swatch-teal')?.querySelector('svg')).toBeTruthy()
  })

  it('cada swatch escopa a própria cor via data-accent (exceto "default")', () => {
    render(<AccentSwatchNav />)
    expect(document.getElementById('accent-swatch-violet')?.getAttribute('data-accent')).toBe('violet')
    expect(document.getElementById('accent-swatch-default')?.hasAttribute('data-accent')).toBe(false)
  })

  it('selecionar dispara onSelect (fecha o menu pai)', () => {
    const onSelect = vi.fn()
    render(<AccentSwatchNav onSelect={onSelect} />)
    fireEvent.click(document.getElementById('accent-swatch-amber')!)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
