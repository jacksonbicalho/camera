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

  describe('CA7: o bloco de ações quebra linha no celular em vez de vazar pra fora da tela (achado real, RecordingsPage no mobile)', () => {
    it('o container das ações tem flex-wrap — item que não cabe desce pra linha de baixo, não vaza à direita', () => {
      render(<PageHeader title="T" actions={<button>Ação</button>} />)
      const actionsContainer = screen.getByText('Ação').parentElement!
      expect(actionsContainer.className).toContain('flex-wrap')
    })

    it('no mobile, itens quebrados alinham à ESQUERDA (justify-start) — acompanha o campo de busca, pedido explícito do navigator', () => {
      render(<PageHeader title="T" actions={<button>Ação</button>} />)
      const actionsContainer = screen.getByText('Ação').parentElement!
      expect(actionsContainer.className).toContain('justify-start')
    })

    it('a partir do breakpoint sm, volta a alinhar à direita (sm:justify-end) — junto do título, mesma linha, quando não há quebra', () => {
      render(<PageHeader title="T" actions={<button>Ação</button>} />)
      const actionsContainer = screen.getByText('Ação').parentElement!
      expect(actionsContainer.className).toContain('sm:justify-end')
    })

    it('largura total no mobile (w-full) — sem isso, um container shrink-0 sem largura explícita dimensiona pelo conteúdo máximo e flex-wrap sozinho não força a quebra', () => {
      render(<PageHeader title="T" actions={<button>Ação</button>} />)
      const actionsContainer = screen.getByText('Ação').parentElement!
      expect(actionsContainer.className).toContain('w-full')
    })

    it('a partir do breakpoint sm, volta a dimensionar pelo conteúdo (sm:w-auto) — não força largura total em telas onde tudo já cabe numa linha', () => {
      render(<PageHeader title="T" actions={<button>Ação</button>} />)
      const actionsContainer = screen.getByText('Ação').parentElement!
      expect(actionsContainer.className).toContain('sm:w-auto')
    })

    it('REGRESSÃO: o container EXTERNO (título+ações) tem flex-wrap por padrão, sem precisar da prop className — achado real (medido via Chromium headless): sem isso, o bloco de ações com w-full consome a linha inteira e o TÍTULO colapsa pra width:0 (fica invisível) em qualquer página que não passasse className="flex-wrap" manualmente', () => {
      render(<PageHeader id="ph" title="T" actions={<button>Ação</button>} />)
      const outer = document.getElementById('ph')!
      expect(outer.className).toContain('flex-wrap')
    })
  })
})
