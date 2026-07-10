import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SettingsLayout from './SettingsLayout'
import { getRole } from '../auth'

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

afterEach(() => {
  cleanup()
  vi.mocked(getRole).mockReturnValue('admin')
})

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
  it('renderiza os filhos e as seções de configuração (admin)', () => {
    renderAt('/settings/about')
    expect(document.body.textContent).toContain('conteúdo')
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/users"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/stats"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/about"]')).toBeTruthy()
  })

  it('viewer só vê as seções permitidas', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/settings/about')
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/about"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/users"]')).toBeNull()
    expect(document.querySelector('a[href="/settings/server"]')).toBeNull()
  })

  it('marca a seção atual como ativa', () => {
    renderAt('/settings/about')
    const link = document.querySelector('a[href="/settings/about"]')
    expect(link?.getAttribute('aria-current')).toBe('page')
  })

  it('repassa id/footerId pro Layout', () => {
    renderAt('/settings/about')
    expect(document.getElementById('about-page')).not.toBeNull()
    expect(document.getElementById('about-footer')).not.toBeNull()
  })
})
