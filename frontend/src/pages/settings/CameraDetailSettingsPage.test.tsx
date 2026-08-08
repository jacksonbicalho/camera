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
      cameras: [
        {
          id: 'cam-1',
          name: 'Corredor de entrada',
          rtsp_url: 'rtsp://cam/stream',
          capture_type: 'rtsp',
          video_codec: '',
          has_audio: null,
          width: 0,
          height: 0,
          reconnect_interval: '30s',
          recording_enabled: true,
          chunk_duration: '5m',
          record_video_mode: 'auto',
          live_enabled: true,
          live_transport: 'auto',
          hls_video_mode: 'auto',
          hls_segment_seconds: null,
          hls_list_size: null,
          hls_dvr_seconds: null,
        },
      ],
    },
    reload: () => {},
  }),
}))
vi.mock('../../hooks/useMotionPeak', () => ({ useMotionPeak: () => null }))

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

  describe('CA5: "Detecção de movimento" vira sessão dentro da página (migrada de CameraMotionSettingsPage, rota /settings/cameras/motion/:id removida)', () => {
    it('a sessão de detecção de movimento aparece na mesma página, sem precisar de outra rota', async () => {
      renderAt('/settings/cameras/cam-1')
      await waitFor(() => {
        expect(document.body.textContent).toContain('Detecção de movimento')
      })
      expect(document.getElementById('motion_enabled')).toBeTruthy()
    })
  })

  describe('visualização espelha as mesmas sessões do form (Captura/Gravação/Transmissão), fechadas', () => {
    it('mostra as 3 sessões com os dados reais da câmera, em vez do agrupamento antigo Vídeo/Transmissão ao vivo', async () => {
      renderAt('/settings/cameras/cam-1')
      await waitFor(() => {
        expect(screen.getByText('Captura')).toBeTruthy()
      })
      expect(screen.getByText('Gravação')).toBeTruthy()
      expect(screen.getByText('Transmissão')).toBeTruthy()
      expect(screen.queryByText('Vídeo')).toBeNull()
      expect(screen.queryByText('Transmissão ao vivo')).toBeNull()
      expect(screen.getByText('rtsp://cam/stream')).toBeTruthy()
    })
  })
})
