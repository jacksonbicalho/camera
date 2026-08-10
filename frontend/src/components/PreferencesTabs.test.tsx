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
