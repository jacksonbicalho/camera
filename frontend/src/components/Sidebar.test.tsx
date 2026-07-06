import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { clearToken, getRole } from '../auth'

vi.mock('../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  getUsername: () => 'jackson',
  clearToken: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

afterEach(() => {
  cleanup()
  vi.mocked(getRole).mockReturnValue('admin')
})

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

  it('Configurações é um botão (não link) que abre um flyout com as seções — admin vê todas', () => {
    renderAt('/')
    const btn = document.getElementById('sidebar-config')!
    expect(btn.tagName).toBe('BUTTON')
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeNull()
    fireEvent.click(btn)
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/users"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/about"]')).toBeTruthy()
  })

  it('viewer só vê as seções permitidas no flyout', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/appearance"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/about"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/users"]')).toBeNull()
    expect(document.querySelector('a[href="/settings/server"]')).toBeNull()
  })

  it('flyout fecha ao selecionar uma seção', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    const link = document.querySelector('a[href="/settings/cameras"]')!
    fireEvent.click(link)
    expect(document.querySelector('a[href="/settings/users"]')).toBeNull()
  })

  it('Configurações fica marcado ativo em qualquer rota /settings/*', () => {
    renderAt('/settings/appearance')
    expect(document.getElementById('sidebar-config')?.className).toContain('bg-primary')
  })

  it('usuário aparece no rodapé (sidebar-bottom) e abre menu com Notificações/Alterar senha/Sair', () => {
    renderAt('/')
    const bottom = document.getElementById('sidebar-bottom')!
    const btn = document.getElementById('sidebar-user')!
    expect(bottom.contains(btn)).toBe(true)
    expect(document.querySelector('a[href="/notifications"]')).toBeNull()
    fireEvent.click(btn)
    expect(document.querySelector('a[href="/notifications"]')).toBeTruthy()
    expect(document.querySelector('a[href="/change-password"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Sair')
  })

  it('"Sair" limpa o token', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-user')!)
    const sairBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Sair')!
    fireEvent.click(sairBtn)
    expect(clearToken).toHaveBeenCalled()
  })

  it('flyout de Configurações mostra os swatches de cor de destaque (5 opções)', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    expect(document.getElementById('accent-swatch-nav')).not.toBeNull()
    expect(document.getElementById('accent-swatch-default')).not.toBeNull()
    expect(document.getElementById('accent-swatch-violet')).not.toBeNull()
    expect(document.getElementById('accent-swatch-teal')).not.toBeNull()
    expect(document.getElementById('accent-swatch-coral')).not.toBeNull()
    expect(document.getElementById('accent-swatch-amber')).not.toBeNull()
  })
})
