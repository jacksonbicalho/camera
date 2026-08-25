import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './LoginPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

let tokenValue: string | null = null
let mustChangePasswordValue = false

vi.mock('../auth', () => ({
  login: vi.fn(),
  mustChangePassword: () => mustChangePasswordValue,
  getToken: () => tokenValue,
}))

import { login } from '../auth'

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/change-password" element={<div>CHANGE PASSWORD</div>} />
        <Route path="/forgot-password" element={<div>FORGOT PASSWORD</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    tokenValue = null
    mustChangePasswordValue = false
  })

  it('associates labels and inputs via htmlFor/id', () => {
    renderLogin()
    expect(screen.getByLabelText(/e-mail/i)).toBeInstanceOf(HTMLInputElement)
    expect(screen.getByLabelText('Senha')).toBeInstanceOf(HTMLInputElement)
  })

  it('informa que o login aceita usuário ou e-mail', () => {
    renderLogin()
    expect(screen.getByLabelText(/usuário ou e-mail/i)).toBeInstanceOf(HTMLInputElement)
    expect(screen.getByText(/pode entrar com seu usuário ou e-mail/i)).not.toBeNull()
  })

  it('sets autoComplete for email/username and current password', () => {
    renderLogin()
    expect(screen.getByLabelText(/e-mail/i).getAttribute('autocomplete')).toBe('username')
    expect(screen.getByLabelText('Senha').getAttribute('autocomplete')).toBe('current-password')
  })

  it('toggles password visibility with the "Mostrar"/"Ocultar" button', () => {
    renderLogin()
    const passwordInput = screen.getByLabelText('Senha') as HTMLInputElement
    expect(passwordInput.type).toBe('password')

    fireEvent.click(screen.getByRole('button', { name: /mostrar/i }))
    expect(passwordInput.type).toBe('text')

    fireEvent.click(screen.getByRole('button', { name: /ocultar/i }))
    expect(passwordInput.type).toBe('password')
  })

  it('has a "Lembrar de mim" checkbox, unchecked by default (opt-in, não persiste sem escolha explícita)', () => {
    renderLogin()
    const checkbox = screen.getByLabelText(/lembrar de mim/i) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('has a link to "Esqueceu a senha?"', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('link', { name: /esqueceu a senha/i }))
    expect(screen.queryByText('FORGOT PASSWORD')).not.toBeNull()
  })

  it('shows the error with role="alert" and marks fields aria-invalid on failed login', async () => {
    vi.mocked(login).mockRejectedValueOnce(new Error('bad credentials'))
    renderLogin()

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Usuário ou senha inválidos')
    expect(screen.getByLabelText(/e-mail/i).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Senha').getAttribute('aria-invalid')).toBe('true')
  })

  it('shows a Loader2 spinner while logging in', async () => {
    let resolveLogin: () => void = () => {}
    vi.mocked(login).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveLogin = resolve
      }),
    )
    renderLogin()

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    expect(document.querySelector('.animate-spin')).not.toBeNull()
    resolveLogin()
    await waitFor(() => expect(document.querySelector('.animate-spin')).toBeNull())
  })

  it('sem marcar "Lembrar de mim", loga com remember=false (default opt-in)', async () => {
    vi.mocked(login).mockResolvedValueOnce(undefined)
    renderLogin()

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('admin@example.com', 'secret', false))
  })

  it('marcando "Lembrar de mim", loga com remember=true', async () => {
    vi.mocked(login).mockResolvedValueOnce(undefined)
    renderLogin()

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByLabelText(/lembrar de mim/i))
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('admin@example.com', 'secret', true))
  })

  it('CA3: envia o identifier sem espaço nas pontas, mesmo com espaço digitado no campo', async () => {
    vi.mocked(login).mockResolvedValueOnce(undefined)
    renderLogin()

    // Valor único nesta suíte (não repetido por nenhum outro teste do
    // arquivo) — o mock `login` não tem seu histórico de chamadas limpo
    // entre testes (só `vi.restoreAllMocks()`, não `clearAllMocks()`), então
    // reusar um identifier já testado em outro `it` faria essa asserção
    // "passar" por acidente, casando com a chamada de um teste anterior em
    // vez da chamada real deste.
    fireEvent.change(screen.getByLabelText(/e-mail/i), {
      target: { value: '  trim-unico@example.com  ' },
    })
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('trim-unico@example.com', 'secret', false),
    )
  })

  it('redirects to / on mount when a valid token already exists', async () => {
    tokenValue = 'fake-token'
    mustChangePasswordValue = false
    renderLogin()
    await waitFor(() => expect(screen.queryByText('HOME')).not.toBeNull())
  })

  it('redirects to /change-password on mount when must-change-password token exists', async () => {
    tokenValue = 'fake-token'
    mustChangePasswordValue = true
    renderLogin()
    await waitFor(() => expect(screen.queryByText('CHANGE PASSWORD')).not.toBeNull())
  })
})
