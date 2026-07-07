import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProfilePage from './ProfilePage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
}))

vi.mock('../components/ProfileLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const adminProfile = { username: 'jackson', email: 'jackson@example.com', name: 'Jackson', role: 'admin' }
const viewerProfile = { username: 'ana', email: 'ana@example.com', name: '', role: 'viewer' }

function stubFetch(profile: typeof adminProfile = adminProfile) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/me' && (!init || !init.method)) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(profile) })
      }
      if (url === '/api/me' && init?.method === 'PUT') {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
      }
      if (url === '/api/me/email/request-change') {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
      }
      if (url === '/api/me/email/confirm-change') {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('') })
      }
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })
    }),
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    stubFetch()
  })

  it('mostra os campos na ordem Nome, E-mail, Usuário, Perfil de acesso (admin vê o perfil de acesso)', async () => {
    render(<ProfilePage />)
    await waitFor(() => {
      expect(document.getElementById('profile-details')).not.toBeNull()
    })
    const labels = Array.from(document.querySelectorAll('#profile-details .text-caption')).map(el => el.textContent)
    expect(labels).toEqual(['Nome', 'E-mail', 'Usuário', 'Perfil de acesso'])
    expect(screen.getByText('Administrador')).toBeTruthy()
  })

  it('viewer NÃO vê "Perfil de acesso"', async () => {
    stubFetch(viewerProfile)
    render(<ProfilePage />)
    await waitFor(() => {
      expect(document.getElementById('profile-details')).not.toBeNull()
    })
    const labels = Array.from(document.querySelectorAll('#profile-details .text-caption')).map(el => el.textContent)
    expect(labels).toEqual(['Nome', 'E-mail', 'Usuário'])
  })

  it('"Editar" (e-mail) abre o form de novo e-mail; "Cancelar" volta pro modo leitura', async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(document.getElementById('profile-edit-email')).not.toBeNull())

    fireEvent.click(document.getElementById('profile-edit-email')!)
    expect(screen.getByLabelText('Novo e-mail')).toBeTruthy()

    fireEvent.click(document.getElementById('profile-cancel-email')!)
    expect(screen.queryByLabelText('Novo e-mail')).toBeNull()
    expect(document.getElementById('profile-edit-email')).not.toBeNull()
  })

  it('enviar código chama request-change e mostra o form de código; confirmar chama confirm-change', async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(document.getElementById('profile-edit-email')).not.toBeNull())
    fireEvent.click(document.getElementById('profile-edit-email')!)

    fireEvent.change(screen.getByLabelText('Novo e-mail'), { target: { value: 'novo@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar código/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/me/email/request-change',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ new_email: 'novo@example.com' }) }),
      )
    })
    expect(await screen.findByLabelText('Código de confirmação')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Código de confirmação'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/me/email/confirm-change',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ code: '123456' }) }),
      )
    })
    expect(await screen.findByText('E-mail atualizado com sucesso.')).toBeTruthy()
  })

  it('"Editar" no rodapé abre form de Nome/Usuário pré-preenchido; salvar chama PUT /api/me', async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(document.getElementById('profile-edit-basic')).not.toBeNull())

    fireEvent.click(document.getElementById('profile-edit-basic')!)
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Jackson')
    expect((screen.getByLabelText('Usuário') as HTMLInputElement).value).toBe('jackson')

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Jackson B.' } })
    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'jacksonb' } })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/me',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Jackson B.', username: 'jacksonb' }),
        }),
      )
    })
    expect(await screen.findByText('Dados atualizados com sucesso.')).toBeTruthy()
  })

  it('cancelar a edição de Nome/Usuário descarta as mudanças sem chamar a API', async () => {
    render(<ProfilePage />)
    await waitFor(() => expect(document.getElementById('profile-edit-basic')).not.toBeNull())
    fireEvent.click(document.getElementById('profile-edit-basic')!)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Outro nome' } })
    fireEvent.click(document.getElementById('profile-cancel-basic')!)

    expect(screen.queryByLabelText('Nome')).toBeNull()
    expect(document.getElementById('profile-edit-basic')).not.toBeNull()
  })

  it('usuário duplicado (409) mostra mensagem de erro', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/me' && (!init || !init.method)) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(adminProfile) })
        }
        if (url === '/api/me' && init?.method === 'PUT') {
          return Promise.resolve({ ok: false, status: 409, text: () => Promise.resolve('') })
        }
        return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })
      }),
    )
    render(<ProfilePage />)
    await waitFor(() => expect(document.getElementById('profile-edit-basic')).not.toBeNull())
    fireEvent.click(document.getElementById('profile-edit-basic')!)
    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'jaocupado' } })
    fireEvent.click(screen.getByRole('button', { name: /^salvar$/i }))

    expect(await screen.findByText('Esse usuário já está em uso.')).toBeTruthy()
  })
})
