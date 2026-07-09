import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ResetPasswordPage from './ResetPasswordPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage(search = '?token=abc123') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ResetPasswordPage', () => {
  it('rejects mismatched passwords with role="alert"', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), {
      target: { value: 'different123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /redefinir/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('não coincidem')
  })

  it('submits the token from the URL and the new password', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch

    renderPage('?token=abc123')
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /redefinir/i }))

    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/reset-password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'abc123', password: 'password123' }),
        }),
      ),
    )
  })

  it('redirects to /login on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    renderPage()

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /redefinir/i }))

    await waitFor(() => expect(screen.queryByText('LOGIN')).not.toBeNull())
  })

  it('shows an error when the token is invalid/expired', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    renderPage()

    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /redefinir/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/inválid|expirad/i)
  })
})
