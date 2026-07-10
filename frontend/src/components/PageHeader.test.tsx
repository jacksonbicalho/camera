import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PageHeader from './PageHeader'

afterEach(cleanup)

describe('PageHeader', () => {
  it('renderiza o título com o id no wrapper; sempre text-2xl (padrão único)', () => {
    render(<PageHeader id="ph" title="Relatórios" />)
    const h = screen.getByRole('heading', { name: 'Relatórios' })
    expect(h.className).toContain('text-2xl')
    expect(document.getElementById('ph')).toBeTruthy()
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
