import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CameraStatesSettingsPage from './CameraStatesSettingsPage'

vi.mock('../../auth', () => ({
  getRole: () => 'admin',
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function stubFetch(stateTrainerId: number | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url)
      if (u.endsWith('/classifiers')) return new Response(JSON.stringify([]), { status: 200 })
      if (u === '/api/settings/analysis')
        return new Response(JSON.stringify({ state_trainer_id: stateTrainerId }), { status: 200 })
      return new Response('{}', { status: 200 })
    }),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/states/cam1']}>
      <Routes>
        <Route path="/settings/states/:id" element={<CameraStatesSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CA6: "Novo classificador" exige um trainer de state classification configurado', () => {
  beforeEach(() => cleanup())

  it('sem state_trainer_id configurado, o botão fica desabilitado e explica o motivo', async () => {
    stubFetch(null)
    renderPage()

    const btn = (await screen.findByText(/novo classificador/i)).closest(
      'button',
    ) as HTMLButtonElement
    await vi.waitFor(() => expect(btn.disabled).toBe(true))
    await screen.findByText(/configure um trainer/i)
  })

  it('com state_trainer_id configurado, o botão continua habilitado', async () => {
    stubFetch(7)
    renderPage()

    const btn = (await screen.findByText(/novo classificador/i)).closest(
      'button',
    ) as HTMLButtonElement
    await vi.waitFor(() => expect(btn.disabled).toBe(false))
    expect(screen.queryByText(/configure um trainer/i)).toBeNull()
  })
})
