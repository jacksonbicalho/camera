import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DatePicker from './DatePicker'

afterEach(cleanup)

describe('DatePicker', () => {
  it('mostra a data e alterna o popover', () => {
    render(<DatePicker id="dp" value={new Date(2026, 5, 15)} onChange={() => {}} />)
    expect(document.getElementById('dp')!.textContent).toContain('15/06/2026')
    expect(document.getElementById('dp-popover')).toBeNull()
    fireEvent.click(document.getElementById('dp')!)
    expect(document.getElementById('dp-popover')).toBeTruthy()
  })

  it('escolher um dia dispara onChange e fecha o popover', () => {
    const onChange = vi.fn()
    render(<DatePicker id="dp" value={new Date(2026, 5, 15)} onChange={onChange} />)
    fireEvent.click(document.getElementById('dp')!)
    fireEvent.click(screen.getByText('20'))
    expect(onChange).toHaveBeenCalled()
    expect(document.getElementById('dp-popover')).toBeNull()
  })

  it('openUp: popover abre pra cima (style.bottom), não pra baixo (sem style.top) — evita ficar escondido perto do rodapé', () => {
    render(<DatePicker id="dp" value={new Date(2026, 5, 15)} onChange={() => {}} openUp />)
    fireEvent.click(document.getElementById('dp')!)
    const popover = document.getElementById('dp-popover') as HTMLElement
    expect(popover.style.bottom).not.toBe('')
    expect(popover.style.top).toBe('')
  })

  it('fullWidth: popover ganha largura explícita (do gatilho) — sem isso, um gatilho esticado numa coluna estreita deixaria o popover mais largo que a coluna, vazando por cima do conteúdo ao lado', () => {
    render(<DatePicker id="dp" value={new Date(2026, 5, 15)} onChange={() => {}} fullWidth />)
    fireEvent.click(document.getElementById('dp')!)
    const popover = document.getElementById('dp-popover') as HTMLElement
    expect(popover.style.width).not.toBe('')
  })

  it('sem fullWidth (default), o popover NÃO ganha largura explícita — usa a largura natural do calendário', () => {
    render(<DatePicker id="dp" value={new Date(2026, 5, 15)} onChange={() => {}} />)
    fireEvent.click(document.getElementById('dp')!)
    const popover = document.getElementById('dp-popover') as HTMLElement
    expect(popover.style.width).toBe('')
  })

  describe('CA3: popover via portal, só fecha em clique genuinamente fora dele', () => {
    it('popover renderiza via portal (filho de document.body), não fica preso a nenhum overflow-hidden ancestral', () => {
      render(<DatePicker id="dp" value={new Date(2026, 5, 15)} onChange={() => {}} />)
      fireEvent.click(document.getElementById('dp')!)
      const popover = document.getElementById('dp-popover')!
      expect(popover.parentElement).toBe(document.body)
    })

    it('clicar dentro do popover (ex.: navegação de mês do calendário) não fecha o popover como se fosse clique-fora', () => {
      render(<DatePicker id="dp" value={new Date(2026, 5, 15)} onChange={() => {}} />)
      fireEvent.click(document.getElementById('dp')!)
      const popover = document.getElementById('dp-popover')!
      fireEvent.mouseDown(popover)
      expect(document.getElementById('dp-popover')).not.toBeNull()
    })

    it('clicar genuinamente fora (nem botão, nem popover) fecha o popover', () => {
      render(<DatePicker id="dp" value={new Date(2026, 5, 15)} onChange={() => {}} />)
      fireEvent.click(document.getElementById('dp')!)
      expect(document.getElementById('dp-popover')).not.toBeNull()
      fireEvent.mouseDown(document.body)
      expect(document.getElementById('dp-popover')).toBeNull()
    })
  })

  it('com availableDays: dia sem conteúdo fica desabilitado, dia com conteúdo habilitado', () => {
    const onChange = vi.fn()
    render(
      <DatePicker
        id="dp"
        value={new Date(2026, 5, 15)}
        onChange={onChange}
        availableDays={['2026-06-20']}
      />,
    )
    fireEvent.click(document.getElementById('dp')!)

    // 15/06 não está no conjunto → clicar não dispara onChange
    fireEvent.click(screen.getByText('15'))
    expect(onChange).not.toHaveBeenCalled()

    // 20/06 está no conjunto → clicar dispara
    fireEvent.click(screen.getByText('20'))
    expect(onChange).toHaveBeenCalled()
  })
})
