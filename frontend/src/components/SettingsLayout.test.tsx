import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsLayout from './SettingsLayout'

vi.mock('../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  getUsername: () => 'jackson',
  clearToken: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [],
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

afterEach(cleanup)

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SettingsLayout id="about-page" footerId="about-footer">
        <p>conteúdo</p>
      </SettingsLayout>
    </MemoryRouter>,
  )
}

describe('SettingsLayout', () => {
  it('renderiza os filhos dentro do Layout, com largura fluida (.page-content)', () => {
    renderAt('/settings/about')
    expect(document.body.textContent).toContain('conteúdo')
    expect(document.getElementById('about-page-content')?.className).toContain('page-content')
  })

  it('repassa id/footerId pro Layout', () => {
    renderAt('/settings/about')
    expect(document.getElementById('about-page')).not.toBeNull()
    expect(document.getElementById('about-footer')).not.toBeNull()
  })
})
