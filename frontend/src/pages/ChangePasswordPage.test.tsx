import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ChangePasswordPage from './ChangePasswordPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

vi.mock('../auth', () => ({
  getUsername: () => 'admin',
  changePassword: vi.fn(),
  login: vi.fn(),
  clearToken: vi.fn(),
  getRole: () => 'admin',
  authHeaders: () => ({}),
  mustChangePassword: () => false,
}))

vi.mock('../components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { changePassword, login } from '../auth'

function renderChangePassword() {
  return render(
    <MemoryRouter initialEntries={['/change-password']}>
      <Routes>
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    vi.mocked(changePassword).mockResolvedValue(undefined)
    vi.mocked(login).mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
  })

  it('associates labels and inputs via htmlFor/id', () => {
    renderChangePassword()
    expect(screen.getByLabelText('Nova senha')).toBeInstanceOf(HTMLInputElement)
    expect(screen.getByLabelText('Confirmar senha')).toBeInstanceOf(HTMLInputElement)
  })

  it('keeps autoComplete="new-password" on both fields', () => {
    renderChangePassword()
    expect(screen.getByLabelText('Nova senha').getAttribute('autocomplete')).toBe('new-password')
    expect(screen.getByLabelText('Confirmar senha').getAttribute('autocomplete')).toBe('new-password')
  })

  it('shows the mismatch error with role="alert" and marks fields aria-invalid', async () => {
    renderChangePassword()

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'different123' } })
    fireEvent.click(screen.getByRole('button', { name: /definir nova senha/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('As senhas não coincidem')
    expect(screen.getByLabelText('Nova senha').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Confirmar senha').getAttribute('aria-invalid')).toBe('true')
  })

  it('shows a Loader2 spinner while saving', async () => {
    let resolveChange: () => void = () => {}
    vi.mocked(changePassword).mockReturnValueOnce(
      new Promise<void>(resolve => { resolveChange = resolve }),
    )
    renderChangePassword()

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /definir nova senha/i }))

    expect(document.querySelector('.animate-spin')).not.toBeNull()
    resolveChange()
    await waitFor(() => expect(document.querySelector('.animate-spin')).toBeNull())
  })
})
