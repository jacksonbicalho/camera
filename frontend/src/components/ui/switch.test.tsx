import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Switch } from './switch'

afterEach(cleanup)

describe('CA2: Switch (components/ui) renderiza role="switch"/aria-checked e alterna via onChange', () => {
  it('aria-checked reflete checked e clicar chama onChange com o valor invertido', () => {
    const onChange = vi.fn()
    render(<Switch id="acme" checked={false} onChange={onChange} />)

    const el = screen.getByRole('switch')
    expect(el.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(el)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('checked=true reflete aria-checked=true', () => {
    render(<Switch id="acme" checked={true} onChange={() => {}} />)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('disabled impede o clique de chamar onChange', () => {
    const onChange = vi.fn()
    render(<Switch id="acme" checked={false} onChange={onChange} disabled />)

    fireEvent.click(screen.getByRole('switch'))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('renderiza children (rótulo/legenda) dentro do próprio botão do switch', () => {
    render(
      <Switch id="acme" checked={false} onChange={() => {}}>
        <span>Reprodução contínua</span>
      </Switch>,
    )

    expect(screen.getByText('Reprodução contínua')).toBeTruthy()
  })
})
