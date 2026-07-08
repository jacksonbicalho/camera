import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppSidebar from './AppSidebar'

const setDisplayMode = vi.fn()

vi.mock('../auth', () => ({
  getRole: () => 'admin',
  getUsername: () => 'admin',
  authHeaders: () => ({}),
  clearToken: vi.fn(),
  onUnauthorized: vi.fn(),
}))

vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [], unreadCount: 0,
    markRead: vi.fn(), markSelectedRead: vi.fn(),
    remove: vi.fn(), removeAll: vi.fn(), removeSelected: vi.fn(),
    browserSupported: false, browserPermission: 'default', browserEnabled: false,
    enableBrowserNotifications: vi.fn(), disableBrowserNotifications: vi.fn(),
  }),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

vi.mock('../contexts/SidebarContext', () => ({
  useSidebarItems: () => [],
}))

vi.mock('../contexts/DisplayModeContext', () => ({
  useDisplayMode: () => ({ sidebar: 'icons-text' }),
  useSetDisplayMode: () => setDisplayMode,
}))

vi.mock('./ThemeModeNav', () => ({
  default: () => <div id="theme-mode-nav" />,
}))

afterEach(() => { cleanup(); setDisplayMode.mockClear() })

function renderSidebar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppSidebar username="admin" />
    </MemoryRouter>,
  )
}

const LINK_ITEMS: Array<[string, string, string]> = [
  ['nav-recordings', '/recordings', 'Gravações'],
]

const FOLLOWS = Node.DOCUMENT_POSITION_FOLLOWING

describe('Sidebar — nav rail principal', () => {
  it('renderiza os itens de navegação novos como links rotulados com id e rota', () => {
    renderSidebar()
    for (const [id, to, label] of LINK_ITEMS) {
      const el = document.getElementById(id)
      expect(el, id).toBeTruthy()
      expect(el!.getAttribute('href'), `${id} href`).toBe(to)
      expect(el!.textContent, `${id} label`).toContain(label)
    }
  })

  it('não duplica "Usuários" na nav (fica só no flyout de Configurações)', () => {
    renderSidebar()
    expect(document.getElementById('nav-users')).toBeNull()
  })

  it('não renderiza mais "Relatórios" (mudou pro sidebar novo)', () => {
    renderSidebar()
    expect(document.getElementById('nav-reports')).toBeNull()
  })

  it('não renderiza mais "Ao vivo" (rota "/" agora é a AllCamerasPage, fora do sidebar legado)', () => {
    renderSidebar()
    expect(document.getElementById('nav-live')).toBeNull()
  })

  it('não renderiza mais o sino de Eventos (mudou pro sidebar novo — MotionNotificationsBell)', () => {
    renderSidebar()
    expect(document.getElementById('sidebar-notifications')).toBeNull()
    expect(document.getElementById('motion-notifications')).toBeNull()
  })

  it('mantém Configurações (flyout) com seu rótulo', () => {
    renderSidebar()
    const settings = document.getElementById('sidebar-settings')!
    expect(settings.textContent).toContain('Configurações')
  })

  it('Configurações fica na nav do topo (após Gravações), fora do grupo inferior', () => {
    renderSidebar()
    const settings = document.getElementById('sidebar-settings')!
    const recordings = document.getElementById('nav-recordings')!
    const bottom = document.getElementById('sidebar-bottom')!
    // não está no grupo inferior
    expect(bottom.contains(settings)).toBe(false)
    // aparece depois de Gravações no DOM
    expect(recordings.compareDocumentPosition(settings) & FOLLOWS).toBeTruthy()
  })

  it('o grupo inferior contém apenas Recolher menu e o bloco de usuário', () => {
    renderSidebar()
    const bottom = document.getElementById('sidebar-bottom')!
    expect(bottom.contains(document.getElementById('sidebar-collapse'))).toBe(true)
    expect(bottom.contains(document.getElementById('sidebar-user'))).toBe(true)
    expect(bottom.contains(document.getElementById('sidebar-settings'))).toBe(false)
  })

  it('bloco de usuário exibe nome e papel', () => {
    renderSidebar()
    const user = document.getElementById('sidebar-user')!
    expect(user.textContent).toContain('admin')
    expect(user.textContent).toContain('Administrador')
  })

  it('em /stats o botão Configurações fica aceso (active), como nos itens /settings/*', () => {
    renderSidebar('/stats')
    expect(document.getElementById('sidebar-settings')!.className).toContain('bg-primary')
  })

  it('abrir o flyout não acende Configurações fora de settings/stats (evita dois ícones ativos)', () => {
    renderSidebar('/')
    fireEvent.click(document.getElementById('sidebar-settings')!)
    expect(document.getElementById('sidebar-settings')!.className).not.toContain('bg-primary')
  })

  it('"Recolher menu" alterna o modo da sidebar para compacto (persistido)', () => {
    renderSidebar()
    const btn = document.getElementById('sidebar-collapse')!
    expect(btn).toBeTruthy()
    fireEvent.click(btn)
    expect(setDisplayMode).toHaveBeenCalledWith('sidebar', 'icons-only')
  })
})
