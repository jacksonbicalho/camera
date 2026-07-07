import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProfileChangePasswordPage from './ProfileChangePasswordPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

vi.mock('../auth', () => ({
  getUsername: () => 'admin',
  changePassword: vi.fn(),
  login: vi.fn(),
  clearToken: vi.fn(),
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
}))

vi.mock('../components/ProfileLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { changePassword, login } from '../auth'

describe('ProfileChangePasswordPage', () => {
  beforeEach(() => {
    vi.mocked(changePassword).mockResolvedValue(undefined)
    vi.mocked(login).mockResolvedValue(undefined)
  })

  it('associates labels and inputs via htmlFor/id', () => {
    render(<ProfileChangePasswordPage />)
    expect(screen.getByLabelText('Nova senha')).toBeInstanceOf(HTMLInputElement)
    expect(screen.getByLabelText('Confirmar senha')).toBeInstanceOf(HTMLInputElement)
  })

  it('rejeita senhas que não coincidem', async () => {
    render(<ProfileChangePasswordPage />)
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'different123' } })
    fireEvent.click(screen.getByRole('button', { name: /definir nova senha/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('As senhas não coincidem')
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('troca a senha com sucesso: chama changePassword + relogin e mostra mensagem de sucesso', async () => {
    render(<ProfileChangePasswordPage />)
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /definir nova senha/i }))

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith('password123')
    })
    expect(login).toHaveBeenCalledWith('admin', 'password123')
    expect(await screen.findByText('Senha alterada com sucesso.')).toBeTruthy()
  })

  it('mostra spinner enquanto salva', async () => {
    let resolveChange: () => void = () => {}
    vi.mocked(changePassword).mockReturnValueOnce(
      new Promise<void>(resolve => { resolveChange = resolve }),
    )
    render(<ProfileChangePasswordPage />)
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /definir nova senha/i }))

    expect(document.querySelector('.animate-spin')).not.toBeNull()
    resolveChange()
    await waitFor(() => expect(document.querySelector('.animate-spin')).toBeNull())
  })
})
