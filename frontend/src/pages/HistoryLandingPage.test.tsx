import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
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

describe('CA6: /history lista câmeras pra escolher; com 1 só, pula direto pra ela', () => {
  it('busca /api/cameras e lista uma câmera por botão', async () => {
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
      expect(document.getElementById('history-landing-camera-cam1')?.textContent).toContain(
        'Corredor',
      )
      expect(document.getElementById('history-landing-camera-cam2')?.textContent).toContain(
        'Quintal',
      )
    })
  })

  it('clicar numa câmera navega pra /history/:cameraId', async () => {
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
      expect(document.getElementById('history-landing-camera-cam1')).toBeTruthy()
    })
    fireEvent.click(document.getElementById('history-landing-camera-cam1')!)
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/history/cam1')
    })
  })

  it('com uma única câmera, pula o picker e navega direto pra /history/:cameraId', async () => {
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
    expect(document.getElementById('history-landing-camera-cam1')).toBeNull()
  })

  it('sem câmeras, mostra "Nenhuma câmera disponível."', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
    )
    renderAt()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Nenhuma câmera disponível.')
    })
  })
})
