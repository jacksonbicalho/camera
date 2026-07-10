import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SectionNavList from './SectionNavList'

afterEach(cleanup)

const items = [
  { id: 'nav-a', to: '/a', label: 'A' },
  { id: 'nav-b', to: '/a/b', label: 'B' },
]

function renderAt(path: string, end = false) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SectionNavList items={items} ariaLabel="Teste" end={end} />
    </MemoryRouter>,
  )
}

describe('SectionNavList', () => {
  it('renderiza um link por item com href correto', () => {
    renderAt('/a')
    expect(document.getElementById('nav-a')?.getAttribute('href')).toBe('/a')
    expect(document.getElementById('nav-b')?.getAttribute('href')).toBe('/a/b')
  })

  it('sem end, a rota-pai fica ativa mesmo numa sub-rota que não está na lista', () => {
    renderAt('/a/outra-coisa')
    expect(document.getElementById('nav-a')?.getAttribute('aria-current')).toBe('page')
  })

  it('com end, só marca ativo na rota exata', () => {
    renderAt('/a/outra-coisa', true)
    expect(document.getElementById('nav-a')?.getAttribute('aria-current')).toBeNull()
  })

  it('nav tem o aria-label repassado', () => {
    renderAt('/a')
    expect(document.querySelector('nav[aria-label="Teste"]')).toBeTruthy()
  })
})
