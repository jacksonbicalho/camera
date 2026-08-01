import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CameraMotionSettingsPage from './CameraMotionSettingsPage'

vi.mock('../../auth', () => ({
  getRole: () => 'viewer',
  authHeaders: () => ({}),
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../components/CameraSettingsTabs', () => ({ default: () => <div /> }))
vi.mock('../../hooks/useMotionPeak', () => ({ useMotionPeak: () => null }))
vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ settings: null, reload: () => {} }),
}))

afterEach(cleanup)

describe('CameraMotionSettingsPage', () => {
  describe('CA5: mostra "nome da câmera / Detecção de movimento" no subtítulo do PageHeader', () => {
    it('subtítulo compõe o nome da câmera (linkável) + "Detecção de movimento"', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([{ id: 'cam-1', name: 'Corredor de entrada', motion: null }]),
          }),
        ),
      )
      render(
        <MemoryRouter initialEntries={['/settings/cameras/motion/cam-1']}>
          <Routes>
            <Route path="/settings/cameras/motion/:id" element={<CameraMotionSettingsPage />} />
          </Routes>
        </MemoryRouter>,
      )
      await waitFor(() => {
        const h3 = screen.getByRole('heading', { level: 3 })
        expect(h3.textContent).toBe('Corredor de entradaDetecção de movimento')
      })
      const link = screen.getByRole('link', { name: 'Corredor de entrada' })
      expect(link.getAttribute('href')).toBe('/settings/cameras/cam-1')
    })
  })
})
