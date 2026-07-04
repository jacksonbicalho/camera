import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import Layout from './Layout'

afterEach(cleanup)

describe('Layout', () => {
  it('renderiza os filhos e o Footer no rodapé', () => {
    render(
      <Layout>
        <p>conteúdo</p>
      </Layout>,
    )
    expect(screen.getByText('conteúdo')).toBeTruthy()
    expect(screen.getByRole('contentinfo').textContent).toContain('os-camera')
  })

  it('aplica id default "layout" e repassa footerId ao Footer', () => {
    render(
      <Layout footerId="page-footer">
        <span>x</span>
      </Layout>,
    )
    expect(document.getElementById('layout')).toBeTruthy()
    expect(screen.getByRole('contentinfo').id).toBe('page-footer')
  })

  it('fixa o rodapé no fundo: root ocupa a viewport em coluna flex, conteúdo cresce', () => {
    render(
      <Layout>
        <span>x</span>
      </Layout>,
    )
    const root = document.getElementById('layout')!
    expect(root.className).toContain('min-h-screen')
    expect(root.className).toContain('flex-col')
    // O wrapper do conteúdo cresce (flex-1) e empurra o Footer para o fim.
    const footer = screen.getByRole('contentinfo')
    expect(footer.previousElementSibling?.className).toContain('flex-1')
  })

  it('contentClassName vai no wrapper de conteúdo; root e Footer ficam sem padding (rodapé flush)', () => {
    render(
      <Layout contentClassName="p-4">
        <span>x</span>
      </Layout>,
    )
    const root = document.getElementById('layout')!
    const footer = screen.getByRole('contentinfo')
    const content = footer.previousElementSibling!
    // padding aplicado ao conteúdo…
    expect(content.className).toContain('flex-1')
    expect(content.className).toContain('p-4')
    // …e NÃO ao root nem ao Footer — o rodapé encosta nas bordas/fundo.
    expect(root.className).not.toContain('p-4')
    expect(footer.className).not.toContain('p-4')
  })
})
