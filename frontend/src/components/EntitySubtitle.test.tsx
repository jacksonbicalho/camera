import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EntitySubtitle from './EntitySubtitle'

afterEach(cleanup)

describe('EntitySubtitle', () => {
  describe('CA2: renderiza "parent / current" com o parent linkável, e sem parent renderiza só o texto atual', () => {
    it('com parent: renderiza item + separador + seção atual, item é um link', () => {
      render(
        <MemoryRouter>
          <EntitySubtitle
            parent={{ label: 'Corredor de entrada', to: '/settings/cameras/cam-1' }}
            current="Zonas"
          />
        </MemoryRouter>,
      )
      const link = screen.getByRole('link', { name: 'Corredor de entrada' })
      expect(link.getAttribute('href')).toBe('/settings/cameras/cam-1')
      expect(screen.getByText('Zonas')).toBeTruthy()
    })

    it('sem parent: renderiza só o texto atual, sem link nenhum', () => {
      render(
        <MemoryRouter>
          <EntitySubtitle current="jackson" />
        </MemoryRouter>,
      )
      expect(screen.getByText('jackson')).toBeTruthy()
      expect(screen.queryByRole('link')).toBeNull()
    })
  })
})
