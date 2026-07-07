import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { DisplayModeProvider } from '../contexts/DisplayModeContext'
import { clearToken, getRole } from '../auth'

vi.mock('../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  getUsername: () => 'jackson',
  clearToken: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.mocked(getRole).mockReturnValue('admin')
})

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DisplayModeProvider>
        <Sidebar />
      </DisplayModeProvider>
    </MemoryRouter>,
  )
}

describe('Sidebar (enxuto)', () => {
  it('renderiza os itens de navegação com ids e hrefs corretos', () => {
    renderAt('/')
    const items: [string, string][] = [
      ['sidebar-cameras', '/'],
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

  it('"Todas as câmeras" (antigo "Início") aponta pra "/"', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-cameras')?.getAttribute('aria-label')).toBe('Todas as câmeras')
  })

  it('marca o item da rota atual como ativo (aria-current) — "/" só ativo em exato', () => {
    renderAt('/recordings')
    expect(document.getElementById('sidebar-gravacoes')?.getAttribute('aria-current')).toBe('page')
    // "Todas as câmeras" (to="/") NÃO fica ativo em /recordings graças ao `end`.
    expect(document.getElementById('sidebar-cameras')?.getAttribute('aria-current')).toBeNull()
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

  it('usuário aparece no rodapé (sidebar-bottom) e abre menu com Notificações/Perfil/Sair', () => {
    renderAt('/')
    const bottom = document.getElementById('sidebar-bottom')!
    const btn = document.getElementById('sidebar-user')!
    expect(bottom.contains(btn)).toBe(true)
    expect(document.querySelector('a[href="/notifications"]')).toBeNull()
    fireEvent.click(btn)
    expect(document.querySelector('a[href="/notifications"]')).toBeTruthy()
    expect(document.querySelector('a[href="/profile"]')).toBeTruthy()
    expect(document.querySelector('a[href="/change-password"]')).toBeNull()
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

  it('recolhido por padrão (w-14, sem labels de texto) e o botão de recolher expande (w-48, com labels)', () => {
    renderAt('/')
    expect(document.getElementById('sidebar')?.className).toContain('w-14')
    expect(document.getElementById('sidebar')?.textContent).not.toContain('Todas as câmeras')

    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar')?.className).toContain('w-48')
    expect(document.getElementById('sidebar')?.textContent).toContain('Todas as câmeras')
    expect(document.getElementById('sidebar')?.textContent).toContain('Gravações')
  })

  it('clicar em recolher de novo (expandido) volta pro estado recolhido', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar')?.className).toContain('w-48')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar')?.className).toContain('w-14')
  })

  it('preferência de recolher/expandir persiste em localStorage (mesma chave do AppSidebar)', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(JSON.parse(localStorage.getItem('ui-display-mode')!).sidebar).toBe('icons-text')
  })
})
