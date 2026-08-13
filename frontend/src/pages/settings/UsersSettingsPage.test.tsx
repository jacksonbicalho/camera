import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import UsersSettingsPage from './UsersSettingsPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const users = [
  { id: 1, username: 'jackson', role: 'admin', cameras: [], created_at: '2026-01-01T00:00:00Z' },
  { id: 2, username: 'ana', role: 'viewer', cameras: ['cam1'], created_at: '2026-01-02T00:00:00Z' },
]

function LocationProbe() {
  const l = useLocation()
  return <div id="test-location">{l.pathname}</div>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/settings/users" element={<UsersSettingsPage />} />
        <Route path="/settings/users/new" element={<UsersSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function stubFetch() {
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

describe('UsersSettingsPage', () => {
  it('lista usuários dentro do Layout novo, com link do usuário apontando pra /settings/users/:id', async () => {
    stubFetch()
    renderAt('/settings/users')
    await waitFor(() => {
      expect(document.body.textContent).toContain('jackson')
    })
    const link = document.querySelector('a[href="/settings/users/1"]')
    expect(link).toBeTruthy()
  })

  it('/settings/users/new abre o formulário de criação automaticamente', async () => {
    stubFetch()
    renderAt('/settings/users/new')
    await waitFor(() => {
      expect(document.getElementById('user-form-username')).toBeTruthy()
    })
  })

  it('cancelar a criação vinda de /settings/users/new navega de volta pra /settings/users', async () => {
    stubFetch()
    renderAt('/settings/users/new')
    await waitFor(() => {
      expect(document.getElementById('user-form-cancel')).toBeTruthy()
    })
    fireEvent.click(document.getElementById('user-form-cancel')!)
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/settings/users')
    })
  })

  describe('CA6: o botão "Editar" da listagem navega direto pra /settings/users/edit/:id', () => {
    it('link "Editar" da linha do usuário aponta pra /settings/users/edit/:id', async () => {
      stubFetch()
      renderAt('/settings/users')
      await waitFor(() => {
        expect(document.body.textContent).toContain('jackson')
      })
      const link = document.querySelector('a[href="/settings/users/edit/1"]')
      expect(link).toBeTruthy()
    })
  })

  describe('CA2: a lista de usuários mostra o NOME da câmera, não o ID', () => {
    it('usuário viewer com câmeras mostra o nome resolvido via /api/cameras, não o id cru', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/users'))
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(users) })
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve([{ id: 'cam1', name: 'Garagem' }]),
            })
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
        }),
      )
      renderAt('/settings/users')

      await waitFor(() => {
        expect(document.body.textContent).toContain('Garagem')
      })
      expect(document.body.textContent).not.toContain('cam1')
    })
  })

  describe('CA4: cada linha da lista de usuários usa um grid de colunas fixas alinhadas', () => {
    it('o wrapper de cada linha tem classe de grid e as 5 células (username/nome/role/câmeras/ações) sempre existem', async () => {
      stubFetch()
      renderAt('/settings/users')

      await waitFor(() => {
        expect(document.getElementById('user-row-1')).toBeTruthy()
      })
      const row1 = document.getElementById('user-row-1')!
      expect(row1.className).toContain('grid')
      expect(document.getElementById('user-row-1-username')).toBeTruthy()
      expect(document.getElementById('user-row-1-name')).toBeTruthy()
      expect(document.getElementById('user-row-1-role')).toBeTruthy()
      expect(document.getElementById('user-row-1-cameras')).toBeTruthy()
      expect(document.getElementById('user-row-1-actions')).toBeTruthy()

      // admin sem câmeras associadas (role admin) mostra 'todas' — a célula
      // "câmeras" nunca fica ausente, senão o item seguinte do grid ocuparia
      // a coluna errada.
      expect(document.getElementById('user-row-1-cameras')?.textContent).toBe('todas')
      // usuário sem `name` — célula existe mesmo vazia (fallback '—').
      expect(document.getElementById('user-row-1-name')?.textContent).toBe('—')
    })
  })
})
