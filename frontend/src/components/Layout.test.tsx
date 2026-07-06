import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Layout from './Layout'

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

afterEach(cleanup)

// O Layout agora contém o Sidebar (NavLink) → precisa de Router.
function renderLayout(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('Layout', () => {
  it('renderiza os filhos e o Footer no rodapé', () => {
    renderLayout(
      <Layout>
        <p>conteúdo</p>
      </Layout>,
    )
    expect(screen.getByText('conteúdo')).toBeTruthy()
    expect(screen.getByRole('contentinfo').textContent).toContain('os-camera')
  })

  it('aplica id default "layout" e repassa footerId ao Footer', () => {
    renderLayout(
      <Layout footerId="page-footer">
        <span>x</span>
      </Layout>,
    )
    expect(document.getElementById('layout')).toBeTruthy()
    expect(screen.getByRole('contentinfo').id).toBe('page-footer')
  })

  it('inclui o rail de navegação (#sidebar); hideNav o esconde', () => {
    renderLayout(
      <Layout>
        <span>x</span>
      </Layout>,
    )
    expect(document.getElementById('sidebar')).toBeTruthy()
    cleanup()
    renderLayout(
      <Layout hideNav>
        <span>x</span>
      </Layout>,
    )
    expect(document.getElementById('sidebar')).toBeNull()
  })

  it('fixa o rodapé no fundo: coluna de conteúdo é flex-col e o conteúdo cresce (flex-1)', () => {
    renderLayout(
      <Layout>
        <span>x</span>
      </Layout>,
    )
    const root = document.getElementById('layout')!
    expect(root.className).toContain('min-h-screen')
    const footer = screen.getByRole('contentinfo')
    const content = footer.previousElementSibling! // wrapper de conteúdo
    expect(content.className).toContain('flex-1')
    // A coluna que empilha conteúdo + footer é flex-col.
    expect(footer.parentElement?.className).toContain('flex-col')
  })

  it('contentClassName vai no wrapper de conteúdo; root e Footer ficam sem padding (rodapé flush)', () => {
    renderLayout(
      <Layout contentClassName="p-4">
        <span>x</span>
      </Layout>,
    )
    const root = document.getElementById('layout')!
    const footer = screen.getByRole('contentinfo')
    const content = footer.previousElementSibling!
    expect(content.className).toContain('flex-1')
    expect(content.className).toContain('p-4')
    expect(root.className).not.toContain('p-4')
    expect(footer.className).not.toContain('p-4')
  })
})
