import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TopBar from './TopBar'
import type { Notification } from '../contexts/NotificationContext'

vi.mock('../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  getUsername: () => 'jackson',
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

function renderTopBar() {
  render(
    <MemoryRouter>
      <TopBar />
    </MemoryRouter>,
  )
}

describe('TopBar', () => {
  it('mostra o logo "os-camera" (sempre com o texto, independente do rail estar colapsado), linkando pra "/"', () => {
    renderTopBar()
    const logo = document.getElementById('logo-app')!
    expect(logo.getAttribute('href')).toBe('/')
    expect(logo.textContent).toContain('os-camera')
  })

  it('mostra o UserMenu (avatar) à direita', () => {
    renderTopBar()
    expect(document.getElementById('logged-in-user')).toBeTruthy()
  })

  it('fica sticky no topo (h-14, mesma altura que a antiga linha de logo do Sidebar)', () => {
    renderTopBar()
    const bar = document.getElementById('top-bar')!
    expect(bar.className).toContain('sticky')
    expect(bar.className).toContain('top-0')
    expect(bar.className).toContain('h-14')
  })
})

describe('CA2: color-mode e motion-notifications migraram pro TopBar', () => {
  it('exibe color-mode e motion-notifications entre o logo e logged-in-user, nessa ordem', () => {
    renderTopBar()
    const ids = Array.from(document.querySelectorAll('#top-bar [id]'))
      .map((el) => el.id)
      .filter((id) =>
        ['logo-app', 'color-mode', 'motion-notifications', 'logged-in-user'].includes(id),
      )
    expect(ids).toEqual(['logo-app', 'color-mode', 'motion-notifications', 'logged-in-user'])
  })

  it('o painel de color-mode ancora abaixo-à-direita do gatilho (dentro da viewport, não vaza pela borda)', () => {
    renderTopBar()
    fireEvent.click(document.getElementById('color-mode')!)
    const flyout = document.getElementById('theme-mode-flyout')!
    expect(flyout.style.position).toBe('fixed')
    expect(flyout.style.right).not.toBe('')
    expect(flyout.style.left).toBe('')
  })

  it('o painel de motion-notifications ancora abaixo-à-direita do gatilho (dentro da viewport, não vaza pela borda)', () => {
    renderTopBar()
    fireEvent.click(document.getElementById('motion-notifications')!)
    const panel = document.getElementById('events-panel')!
    expect(panel.style.position).toBe('fixed')
    expect(panel.style.right).not.toBe('')
    expect(panel.style.left).toBe('')
  })
})

describe('CA4: app-help na TopBar (dropdown com sub-link about-application)', () => {
  it('fechado por padrão; clicar abre um dropdown com o sub-link "Sobre" (about-application) apontando pra /settings/about', () => {
    renderTopBar()
    expect(document.getElementById('about-application')).toBeNull()
    fireEvent.click(document.getElementById('app-help')!)
    const about = document.getElementById('about-application')!
    expect(about.getAttribute('href')).toBe('/settings/about')
  })

  it('clicar no sub-link fecha o dropdown', () => {
    renderTopBar()
    fireEvent.click(document.getElementById('app-help')!)
    fireEvent.click(document.getElementById('about-application')!)
    expect(document.getElementById('about-application')).toBeNull()
  })

  it('o painel ancora abaixo-à-direita do gatilho (mesmo padrão dos demais dropdowns da TopBar)', () => {
    renderTopBar()
    fireEvent.click(document.getElementById('app-help')!)
    const panel = document.getElementById('about-application')!.closest('div')!
    expect(panel.style.position).toBe('fixed')
    expect(panel.style.right).not.toBe('')
    expect(panel.style.left).toBe('')
  })

  it('ordem final da TopBar: logo-app, app-help, color-mode, motion-notifications, logged-in-user', () => {
    renderTopBar()
    const ids = Array.from(document.querySelectorAll('#top-bar [id]'))
      .map((el) => el.id)
      .filter((id) =>
        ['logo-app', 'app-help', 'color-mode', 'motion-notifications', 'logged-in-user'].includes(
          id,
        ),
      )
    expect(ids).toEqual([
      'logo-app',
      'app-help',
      'color-mode',
      'motion-notifications',
      'logged-in-user',
    ])
  })
})
