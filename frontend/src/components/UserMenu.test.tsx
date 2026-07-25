import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import UserMenu from './UserMenu'
import { clearToken } from '../auth'

vi.mock('../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  getUsername: () => 'jackson',
  clearToken: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

afterEach(cleanup)

function renderMenu() {
  render(
    <MemoryRouter>
      <UserMenu />
    </MemoryRouter>,
  )
}

describe('UserMenu', () => {
  it('renderiza o avatar em fluxo (não mais position: fixed — vive dentro da TopBar agora)', () => {
    renderMenu()
    const btn = document.getElementById('logged-in-user')!
    expect(btn.className).not.toContain('fixed')
  })

  it('clicar abre menu com Notificações/Perfil/Sair; clicar de novo fecha', () => {
    renderMenu()
    const btn = document.getElementById('logged-in-user')!
    expect(document.querySelector('a[href="/notifications"]')).toBeNull()
    fireEvent.click(btn)
    expect(document.querySelector('a[href="/notifications"]')).toBeTruthy()
    expect(document.querySelector('a[href="/profile"]')).toBeTruthy()
    expect(document.body.textContent).toContain('Sair')
  })

  it('"Sair" limpa o token', () => {
    renderMenu()
    fireEvent.click(document.getElementById('logged-in-user')!)
    const sairBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Sair',
    )!
    fireEvent.click(sairBtn)
    expect(clearToken).toHaveBeenCalled()
  })
})
