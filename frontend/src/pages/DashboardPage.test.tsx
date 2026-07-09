import { describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryRouter } from 'react-router-dom'
import { afterEach } from 'vitest'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: () => 'admin',
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

import DashboardPage from './DashboardPage'

afterEach(() => cleanup())

describe('DashboardPage — placeholder no layout novo (papel de "todas as câmeras" migrou pra AllCamerasPage)', () => {
  it('não importa AppLayout nem HLSPlayer (legados)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.tsx'), 'utf8')
    expect(source).not.toMatch(/AppLayout/)
    expect(source).not.toMatch(/HLSPlayer/)
  })

  it('renderiza apenas o título "Dashboard"', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    )
    expect(document.getElementById('dashboard-page')?.textContent).toContain('Dashboard')
  })
})
