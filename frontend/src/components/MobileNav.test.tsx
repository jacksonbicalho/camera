import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import { DisplayModeProvider } from '../contexts/DisplayModeContext'
import { MobileNavProvider } from '../contexts/MobileNavContext'
import type { Notification } from '../contexts/NotificationContext'

vi.mock('../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  getUsername: () => 'jackson',
  authHeaders: () => ({}),
  clearToken: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

vi.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', setMode: vi.fn(), theme: 'default' }),
  resolveMode: (m: string) => (m === 'system' ? 'dark' : m),
}))

let notifications: Notification[] = []

vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications,
    unreadCount: 0,
    markRead: vi.fn(),
    markSelectedRead: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
    removeSelected: vi.fn(),
    browserSupported: false,
    browserPermission: 'default',
    browserEnabled: false,
    enableBrowserNotifications: vi.fn(),
    disableBrowserNotifications: vi.fn(),
  }),
}))

afterEach(() => {
  cleanup()
  notifications = []
})

// renderChrome monta TopBar + Sidebar sob o MESMO MobileNavProvider — é a
// única forma de exercitar a integração real (hamburguer na TopBar abrindo o
// drawer da Sidebar), já que as duas árvores vivem em componentes irmãos
// dentro de Layout.tsx.
function renderChrome(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DisplayModeProvider>
        <MobileNavProvider>
          <TopBar />
          <Sidebar />
        </MobileNavProvider>
      </DisplayModeProvider>
    </MemoryRouter>,
  )
}

describe('CA2: navegação mobile — hamburguer na TopBar abre a Sidebar como drawer', () => {
  it('drawer fechado por padrão: sem backdrop', () => {
    renderChrome()
    expect(document.getElementById('mobile-nav-backdrop')).toBeNull()
  })

  it('clicar no hamburguer (mobile-nav-toggle) abre o drawer (backdrop aparece)', () => {
    renderChrome()
    fireEvent.click(document.getElementById('mobile-nav-toggle')!)
    expect(document.getElementById('mobile-nav-backdrop')).not.toBeNull()
  })

  it('clicar no backdrop fecha o drawer', () => {
    renderChrome()
    fireEvent.click(document.getElementById('mobile-nav-toggle')!)
    expect(document.getElementById('mobile-nav-backdrop')).not.toBeNull()
    fireEvent.click(document.getElementById('mobile-nav-backdrop')!)
    expect(document.getElementById('mobile-nav-backdrop')).toBeNull()
  })

  it('pressionar Escape fecha o drawer', () => {
    renderChrome()
    fireEvent.click(document.getElementById('mobile-nav-toggle')!)
    expect(document.getElementById('mobile-nav-backdrop')).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.getElementById('mobile-nav-backdrop')).toBeNull()
  })

  it('clicar num link de navegação da Sidebar fecha o drawer', () => {
    renderChrome()
    fireEvent.click(document.getElementById('mobile-nav-toggle')!)
    expect(document.getElementById('mobile-nav-backdrop')).not.toBeNull()
    fireEvent.click(document.getElementById('sidebar-cameras')!)
    expect(document.getElementById('mobile-nav-backdrop')).toBeNull()
  })

  it('em qualquer estado, o botão sidebar-collapse (colapsar rail) não aparece — só faz sentido no rail persistente (≥lg)', () => {
    renderChrome()
    expect(document.getElementById('sidebar-collapse')?.className).toContain('hidden')
  })

  it('drawer aberto sempre mostra os rótulos, mesmo com a preferência de rail colapsado (icons-only, default) — sem isso não haveria como expandir no mobile', () => {
    localStorage.setItem('ui-display-mode', JSON.stringify({ sidebar: 'icons-only' }))
    renderChrome()
    fireEvent.click(document.getElementById('mobile-nav-toggle')!)
    expect(document.getElementById('sidebar-cameras')?.textContent).toContain('Câmeras')
  })
})
