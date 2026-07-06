import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ForgotPasswordPage from './ForgotPasswordPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ForgotPasswordPage', () => {
  it('submits the email and shows a generic success message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = mockFetch

    renderPage()
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth/forgot-password', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'user@example.com' }),
    })))
    expect(await screen.findByText(/se o e-mail existir/i)).toBeTruthy()
  })

  it('shows the same generic message even when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false })
    renderPage()

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }))

    expect(await screen.findByText(/se o e-mail existir/i)).toBeTruthy()
  })

  it('links back to the login page', () => {
    renderPage()
    fireEvent.click(screen.getByRole('link', { name: /voltar/i }))
    expect(screen.queryByText('LOGIN')).not.toBeNull()
  })
})
