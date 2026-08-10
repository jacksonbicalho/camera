import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PreferencesTabs from './PreferencesTabs'

afterEach(cleanup)

describe('CA7: PreferencesTabs mostra "Extensões" como sub-item de "Preferências"', () => {
  it('renderiza a aba "Extensões" apontando pra /settings/preferences/extensions', () => {
    render(
      <MemoryRouter>
        <PreferencesTabs active="extensions" />
      </MemoryRouter>,
    )

    const tab = screen.getByText('Extensões')
    expect(tab.getAttribute('href')).toBe('/settings/preferences/extensions')
  })
})

describe('CA2: PreferencesTabs mostra "Aparência" como 2ª aba, depois de "Extensões"', () => {
  it('renderiza a aba "Aparência" apontando pra /settings/preferences/appearance', () => {
    render(
      <MemoryRouter>
        <PreferencesTabs active="appearance" />
      </MemoryRouter>,
    )

    const tab = screen.getByText('Aparência')
    expect(tab.getAttribute('href')).toBe('/settings/preferences/appearance')
  })

  it('"Aparência" vem depois de "Extensões" na ordem das abas', () => {
    render(
      <MemoryRouter>
        <PreferencesTabs active="appearance" />
      </MemoryRouter>,
    )

    const extensions = screen.getByText('Extensões')
    const appearance = screen.getByText('Aparência')
    expect(
      extensions.compareDocumentPosition(appearance) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
