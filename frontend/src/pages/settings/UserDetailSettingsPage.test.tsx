import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import UserDetailSettingsPage from './UserDetailSettingsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const users = [
  { id: 1, username: 'jackson', role: 'admin', cameras: [], created_at: '2026-01-01T00:00:00Z' },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubUsersFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/users'))
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(users) })
      if (url.startsWith('/api/cameras'))
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    }),
  )
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/users/:id" element={<UserDetailSettingsPage />} />
        <Route path="/settings/users/edit/:id" element={<UserDetailSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('UserDetailSettingsPage', () => {
  it('renderiza o botão "Novo usuário" apontando pra /settings/users/new, dentro do Layout novo', async () => {
    stubUsersFetch()
    renderAt('/settings/users/1')
    await waitFor(() => {
      expect(document.body.textContent).toContain('jackson')
    })
    expect(document.querySelector('a[href="/settings/users/new"]')).toBeTruthy()
  })

  describe('CA6: /settings/users/edit/:id deriva "editing" da URL e mostra "username / Editar" no subtítulo', () => {
    it('em /settings/users/:id (visualizando): subtítulo é só o username, sem formulário', async () => {
      stubUsersFetch()
      renderAt('/settings/users/1')
      await waitFor(() => {
        const h3 = screen.getByRole('heading', { level: 3 })
        expect(h3.textContent).toBe('jackson')
      })
      expect(document.getElementById('user-form-username')).toBeNull()
    })

    it('em /settings/users/edit/:id (editando): subtítulo é "username / Editar" e o formulário aparece direto, sem clicar em nada', async () => {
      stubUsersFetch()
      renderAt('/settings/users/edit/1')
      await waitFor(() => {
        const h3 = screen.getByRole('heading', { level: 3 })
        expect(h3.textContent).toBe('jackson' + 'Editar')
      })
      expect(document.getElementById('user-form-username')).toBeTruthy()
    })
  })
})
