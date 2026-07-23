import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PageHeader from './PageHeader'

afterEach(cleanup)

describe('PageHeader', () => {
  describe('CA2: título renderiza como <h2> com o token text-h2 do design system (padrão único)', () => {
    it('título renderiza como <h2> com o token text-h2', () => {
      render(<PageHeader id="ph" title="Relatórios" />)
      const h = screen.getByRole('heading', { level: 2, name: 'Relatórios' })
      expect(h.className).toContain('text-h2')
      expect(document.getElementById('ph')).toBeTruthy()
    })
  })

  describe('CA3: subtítulo renderiza como <h3> com o token text-h3 do design system', () => {
    it('subtítulo renderiza como <h3> com o token text-h3', () => {
      render(<PageHeader title="T" subtitle="sub" />)
      const h3 = screen.getByRole('heading', { level: 3, name: 'sub' })
      expect(h3.className).toContain('text-h3')
    })
  })

  it('title aceita ReactNode (não só string), compondo nome + badges', () => {
    render(
      <PageHeader
        id="ph-node"
        title={
          <>
            <span>Entrada</span>
            <span data-testid="badge">AO VIVO</span>
          </>
        }
      />,
    )
    expect(document.getElementById('ph-node')?.textContent).toContain('Entrada')
    expect(screen.getByTestId('badge').textContent).toBe('AO VIVO')
  })

  it('subtítulo e ações: presentes quando passados, ausentes quando não', () => {
    const { rerender } = render(<PageHeader title="T" />)
    expect(screen.queryByText('sub')).toBeNull()
    expect(screen.queryByText('Ação')).toBeNull()

    rerender(<PageHeader title="T" subtitle="sub" actions={<button>Ação</button>} />)
    expect(screen.getByText('sub')).toBeTruthy()
    expect(screen.getByText('Ação')).toBeTruthy()
  })
})
