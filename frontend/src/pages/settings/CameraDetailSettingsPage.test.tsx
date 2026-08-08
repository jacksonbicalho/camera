import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CameraDetailSettingsPage from './CameraDetailSettingsPage'

vi.mock('../../auth', () => ({
  getRole: () => 'admin',
  authHeaders: () => ({}),
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../components/CameraSettingsTabs', () => ({ default: () => <div /> }))
vi.mock('../../components/DeviceInfoPanel', () => ({ default: () => <div /> }))
vi.mock('../../components/CameraForm', () => ({ default: () => <div>form de edição</div> }))
vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      cameras: [{ id: 'cam-1', name: 'Corredor de entrada', rtsp_url: '', video_codec: '' }],
    },
    reload: () => {},
  }),
}))

afterEach(cleanup)

function renderAt(path: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })),
  )
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/cameras/:id" element={<CameraDetailSettingsPage />} />
        <Route path="/settings/cameras/edit/:id" element={<CameraDetailSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CameraDetailSettingsPage', () => {
  describe('CA4: mostra só o nome da câmera no subtítulo quando visualizando, e "nome / Editar" quando editando', () => {
    it('visualizando: subtítulo é só o nome da câmera, sem link', async () => {
      renderAt('/settings/cameras/cam-1')
      await waitFor(() => {
        const h3 = screen.getByRole('heading', { level: 3 })
        expect(h3.textContent).toBe('Corredor de entrada')
      })
      expect(screen.queryByRole('link', { name: 'Corredor de entrada' })).toBeNull()
    })

    it('editando: subtítulo é "nome da câmera / Editar", nome é link de volta pra câmera', async () => {
      renderAt('/settings/cameras/edit/cam-1')
      await waitFor(() => {
        const h3 = screen.getByRole('heading', { level: 3 })
        expect(h3.textContent).toBe('Corredor de entradaEditar')
      })
      const link = screen.getByRole('link', { name: 'Corredor de entrada' })
      expect(link.getAttribute('href')).toBe('/settings/cameras/cam-1')
    })
  })

  describe('CA6: não mostra mais a seção "Estatísticas" (migrada pra ServerSettingsPage)', () => {
    it('visualizando: "Estatísticas" não aparece', async () => {
      renderAt('/settings/cameras/cam-1')
      await waitFor(() => {
        const h3 = screen.getByRole('heading', { level: 3 })
        expect(h3.textContent).toBe('Corredor de entrada')
      })
      expect(document.body.textContent).not.toContain('Estatísticas')
    })
  })
})
