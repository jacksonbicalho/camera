import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProfileLayout from './ProfileLayout'
import { vi } from 'vitest'

vi.mock('../auth', () => ({
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

afterEach(cleanup)

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ProfileLayout>
        <p>conteúdo</p>
      </ProfileLayout>
    </MemoryRouter>,
  )
}

describe('ProfileLayout', () => {
  it('renderiza os filhos e os links do Perfil (Perfil / Alterar e-mail / Alterar senha)', () => {
    renderAt('/profile')
    expect(document.body.textContent).toContain('conteúdo')
    expect(document.getElementById('profile-nav-perfil')?.getAttribute('href')).toBe('/profile')
    expect(document.getElementById('profile-edit-senha')?.getAttribute('href')).toBe(
      '/profile/change-password',
    )
  })

  it('marca o link ativo conforme a rota atual', () => {
    renderAt('/profile/change-password')
    expect(document.getElementById('profile-edit-senha')?.getAttribute('aria-current')).toBe('page')
    expect(document.getElementById('profile-nav-perfil')?.getAttribute('aria-current')).toBeNull()
  })

  it('os links do Perfil continuam visíveis independente da sub-rota (não somem ao trocar de página)', () => {
    renderAt('/profile')
    expect(document.getElementById('profile-nav-perfil')).not.toBeNull()
    expect(document.getElementById('profile-edit-senha')).not.toBeNull()
    cleanup()
    renderAt('/profile/change-password')
    expect(document.getElementById('profile-nav-perfil')).not.toBeNull()
    expect(document.getElementById('profile-edit-senha')).not.toBeNull()
  })

  describe('CA3: link "Alterar e-mail" aparece antes do link de senha (profile-edit-senha)', () => {
    it('profile-edit-email existe, aponta pra /profile/change-email, e vem antes de profile-edit-senha no DOM', () => {
      renderAt('/profile')
      const emailLink = document.getElementById('profile-edit-email')
      const senhaLink = document.getElementById('profile-edit-senha')
      expect(emailLink?.getAttribute('href')).toBe('/profile/change-email')
      expect(senhaLink).not.toBeNull()
      expect(
        emailLink!.compareDocumentPosition(senhaLink!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })

  it('inclui o Sidebar (rail principal) — chegada normal via Layout novo', () => {
    renderAt('/profile')
    expect(document.getElementById('sidebar')).not.toBeNull()
  })

  describe('CA6: título "Perfil" via PageHeader (h2/text-h2), não mais um <h1> solto', () => {
    it('título "Perfil" via PageHeader (h2/text-h2), não mais um <h1> solto', () => {
      renderAt('/profile')
      const title = document.getElementById('profile-header')?.querySelector('h2')
      expect(title?.textContent).toBe('Perfil')
      expect(title?.className).toContain('text-h2')
      expect(document.querySelector('h1')).toBeNull()
    })
  })
})
