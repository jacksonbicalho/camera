import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TopBar from './TopBar'

vi.mock('../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  getUsername: () => 'jackson',
  clearToken: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

afterEach(cleanup)

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
