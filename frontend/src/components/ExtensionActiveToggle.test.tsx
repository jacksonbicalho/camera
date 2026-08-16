import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ExtensionActiveToggle from './ExtensionActiveToggle'

afterEach(() => {
  cleanup()
})

describe('ExtensionActiveToggle', () => {
  it('reflete o valor staged via role="switch"/aria-checked e chama onChange ao clicar', () => {
    const onChange = vi.fn()
    render(
      <ExtensionActiveToggle
        id="acme-active"
        checked={false}
        onChange={onChange}
        savedActive={false}
        description="Habilite para usar a Acme."
      />,
    )

    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(toggle)

    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('quando checked=true, aria-checked reflete true', () => {
    render(
      <ExtensionActiveToggle
        id="acme-active"
        checked={true}
        onChange={() => {}}
        savedActive={true}
        description="Habilite para usar a Acme."
      />,
    )

    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('o selo mostra "Desativado" quando savedActive=false, mesmo com o toggle staged ligado', () => {
    render(
      <ExtensionActiveToggle
        id="acme-active"
        checked={true}
        onChange={() => {}}
        savedActive={false}
        description="Habilite para usar a Acme."
      />,
    )

    expect(screen.getByTestId('acme-active-saved-badge').textContent).toBe('Desativado')
  })

  it('o selo mostra "Ativado" quando savedActive=true, mesmo com o toggle staged desligado', () => {
    render(
      <ExtensionActiveToggle
        id="acme-active"
        checked={false}
        onChange={() => {}}
        savedActive={true}
        description="Habilite para usar a Acme."
      />,
    )

    expect(screen.getByTestId('acme-active-saved-badge').textContent).toBe('Ativado')
  })

  it('label default é "Ativado", mas aceita um label customizado', () => {
    render(
      <ExtensionActiveToggle
        id="acme-active"
        checked={false}
        onChange={() => {}}
        savedActive={false}
        description="Habilite para usar a Acme."
        label="Habilitado"
      />,
    )

    expect(screen.getByText('Habilitado')).toBeTruthy()
  })
})
