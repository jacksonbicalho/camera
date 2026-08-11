import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PreferencesLayout from './PreferencesLayout'

afterEach(() => {
  cleanup()
})

function renderLayout(active: 'extensions' | 'appearance' | 'storage') {
  return render(
    <MemoryRouter>
      <PreferencesLayout active={active}>
        <p>conteúdo</p>
      </PreferencesLayout>
    </MemoryRouter>,
  )
}

describe('CA2: PreferencesLayout mostra só 3 links fixos — Extensões, Aparência, Armazenamento', () => {
  it('mostra exatamente os 3 links, sem categorias/sub-itens por extensão', () => {
    renderLayout('extensions')

    const submenu = document.getElementById('preferences-submenu')!
    const links = Array.from(submenu.querySelectorAll('a')).map((a) => a.textContent)
    expect(links).toEqual(['Extensões', 'Aparência', 'Armazenamento'])
  })

  it('renderiza o conteúdo (children)', () => {
    renderLayout('extensions')
    expect(screen.getByText('conteúdo')).toBeTruthy()
  })
})

describe('CA3: cada um dos 3 links do submenu aponta pra sua própria rota, com o ativo destacado', () => {
  it('links corretos pra cada item', () => {
    renderLayout('extensions')

    expect(document.getElementById('preferences-nav-extensions')?.getAttribute('href')).toBe(
      '/settings/preferences/extensions',
    )
    expect(document.getElementById('preferences-nav-appearance')?.getAttribute('href')).toBe(
      '/settings/preferences/appearance',
    )
    expect(document.getElementById('preferences-nav-storage')?.getAttribute('href')).toBe(
      '/settings/preferences/storage',
    )
  })

  it('destaca o item ativo via aria-current', async () => {
    renderLayout('storage')

    await waitFor(() => {
      expect(document.getElementById('preferences-nav-storage')?.getAttribute('aria-current')).toBe(
        'page',
      )
    })
    expect(
      document.getElementById('preferences-nav-extensions')?.getAttribute('aria-current'),
    ).toBeNull()
    expect(
      document.getElementById('preferences-nav-appearance')?.getAttribute('aria-current'),
    ).toBeNull()
  })
})
