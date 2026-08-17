import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ExtensionCard from './ExtensionCard'

afterEach(() => {
  cleanup()
})

describe('ExtensionCard', () => {
  it('mostra ícone, nome, descrição e children com fieldset habilitado quando available=true, sem opacidade nem tooltip', () => {
    render(
      <ExtensionCard
        id="acme-extension-card"
        icon={<span data-testid="acme-icon" />}
        name="Acme"
        description="Integração com a Acme."
        available
      >
        <button type="button">ação da extensão</button>
      </ExtensionCard>,
    )

    const card = document.getElementById('acme-extension-card') as HTMLElement
    expect(card).toBeTruthy()
    expect(card.className).not.toMatch(/opacity-40/)
    expect(card.getAttribute('title')).toBeNull()
    expect(screen.getByTestId('acme-icon')).toBeTruthy()
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('Integração com a Acme.')).toBeTruthy()
    const action = screen.getByText('ação da extensão') as HTMLButtonElement
    expect(action.closest('fieldset')?.disabled).toBe(false)
  })

  describe('CA2: card mantém altura consistente quando available=false', () => {
    it('fica opaco e ganha tooltip explicando a indisponibilidade, com os children travados num fieldset disabled (não escondidos)', () => {
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

      const card = document.getElementById('acme-extension-card') as HTMLElement
      expect(card.className).toMatch(/opacity-40/)
      expect(card.getAttribute('title')).toBe('Esta extensão não está habilitada nesta instância.')
      expect(screen.queryByText('Extensão não permitida nesta instância.')).toBeNull()

      const action = screen.getByText('ação da extensão') as HTMLButtonElement
      expect(action).toBeTruthy()
      expect(action.closest('fieldset')?.disabled).toBe(true)
    })
  })
})
