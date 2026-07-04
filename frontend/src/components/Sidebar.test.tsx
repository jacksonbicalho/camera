import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'

afterEach(cleanup)

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  )
}

describe('Sidebar (enxuto)', () => {
  it('renderiza os itens de navegação com ids e hrefs corretos', () => {
    renderAt('/')
    const items: [string, string][] = [
      ['sidebar-inicio', '/'],
      ['sidebar-gravacoes', '/recordings'],
      ['sidebar-relatorios', '/reports'],
      ['sidebar-config', '/settings/cameras'],
    ]
    for (const [id, href] of items) {
      const el = document.getElementById(id)
      expect(el, id).toBeTruthy()
      expect(el!.getAttribute('href')).toBe(href)
      expect(el!.getAttribute('aria-label')).toBeTruthy()
    }
    expect(document.getElementById('sidebar')).toBeTruthy()
  })

  it('marca o item da rota atual como ativo (aria-current) — "/" só ativo em exato', () => {
    renderAt('/recordings')
    expect(document.getElementById('sidebar-gravacoes')?.getAttribute('aria-current')).toBe('page')
    // "Início" (to="/") NÃO fica ativo em /recordings graças ao `end`.
    expect(document.getElementById('sidebar-inicio')?.getAttribute('aria-current')).toBeNull()
  })
})
