import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
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

describe('UserDetailSettingsPage', () => {
  it('renderiza o breadcrumb e o botão "Novo usuário" apontando pra /settings/users*, dentro do Layout novo', async () => {
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
    render(
      <MemoryRouter initialEntries={['/settings/users/1']}>
        <Routes>
          <Route path="/settings/users/:id" element={<UserDetailSettingsPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.body.textContent).toContain('jackson')
    })
    expect(document.querySelector('a[href="/settings/users"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/users/new"]')).toBeTruthy()
  })
})
