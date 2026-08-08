import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import AnalysesLandingPage from './AnalysesLandingPage'

vi.mock('../../auth', () => ({
  authHeaders: () => ({}),
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderAt() {
  render(
    <MemoryRouter initialEntries={['/settings/analyses']}>
      <Routes>
        <Route path="/settings/analyses" element={<AnalysesLandingPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// CA4 (história refactor/camera-tabs-para-sidebar-ia): mesmo padrão de
// HistoryLandingPage — /settings/analyses nunca mostra um picker, navega
// direto pra a 1ª câmera assim que a lista carrega. Trocar de câmera depois
// é via o <select> dentro de CameraAnalysisSettingsPage (CA5).
describe('CA4: /settings/analyses nunca mostra um picker — navega direto pra a 1ª câmera assim que a lista carrega', () => {
  it('com várias câmeras, navega pra /settings/analyses/<1ª>', async () => {
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
      expect(document.getElementById('test-location')!.textContent).toBe('/settings/analyses/cam1')
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
    expect(document.getElementById('test-location')!.textContent).toBe('/settings/analyses')
  })
})
