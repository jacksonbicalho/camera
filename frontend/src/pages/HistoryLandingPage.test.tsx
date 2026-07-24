import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import HistoryLandingPage from './HistoryLandingPage'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
}))
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderAt() {
  render(
    <MemoryRouter initialEntries={['/history']}>
      <Routes>
        <Route path="/history" element={<HistoryLandingPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CA6: /history nunca mostra um picker — navega direto pra a 1ª câmera assim que a lista carrega', () => {
  it('com várias câmeras, navega pra a 1ª (troca de câmera depois é via o <select> dentro de HistoryPage)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 'cam1', name: 'Corredor' },
              { id: 'cam2', name: 'Quintal' },
            ]),
        }),
      ),
    )
    renderAt()
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/history/cam1')
    })
  })

  it('com uma única câmera, navega direto pra /history/:cameraId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'cam1', name: 'Corredor' }]),
        }),
      ),
    )
    renderAt()
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/history/cam1')
    })
  })

  it('sem câmeras, mostra "Nenhuma câmera disponível." (sem navegar pra lugar nenhum)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
    )
    renderAt()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Nenhuma câmera disponível.')
    })
    expect(document.getElementById('test-location')!.textContent).toBe('/history')
  })
})
