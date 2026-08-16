import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ExtensionCard from './ExtensionCard'

afterEach(() => {
  cleanup()
})

describe('ExtensionCard', () => {
  it('mostra ícone, nome e descrição sempre, e os children só quando available=true', () => {
    render(
      <ExtensionCard
        id="acme-extension-card"
        icon={<span data-testid="acme-icon" />}
        name="Acme"
        description="Integração com a Acme."
        available
      >
        <p>conteúdo específico da extensão</p>
      </ExtensionCard>,
    )

    expect(document.getElementById('acme-extension-card')).toBeTruthy()
    expect(screen.getByTestId('acme-icon')).toBeTruthy()
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('Integração com a Acme.')).toBeTruthy()
    expect(screen.getByText('conteúdo específico da extensão')).toBeTruthy()
    expect(screen.queryByText('Extensão não permitida nesta instância.')).toBeNull()
  })

  it('quando available=false, mostra a mensagem de indisponibilidade JUNTO dos children, travados num fieldset disabled (não escondidos — mesma altura do card habilitado)', () => {
    render(
      <ExtensionCard
        id="acme-extension-card"
        icon={<span data-testid="acme-icon" />}
        name="Acme"
        description="Integração com a Acme."
        available={false}
      >
        <button type="button">ação da extensão</button>
      </ExtensionCard>,
    )

    expect(screen.getByText('Extensão não permitida nesta instância.')).toBeTruthy()
    const action = screen.getByText('ação da extensão') as HTMLButtonElement
    expect(action).toBeTruthy()
    expect(action.closest('fieldset')?.disabled).toBe(true)
  })
})
