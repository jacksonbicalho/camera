import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import CameraDetailSettingsPage from './CameraDetailSettingsPage'
import { getRole } from '../../auth'

vi.mock('../../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  authHeaders: () => ({}),
}))
vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../components/CameraSettingsTabs', () => ({ default: () => <div /> }))
vi.mock('../../components/DeviceInfoPanel', () => ({ default: () => <div /> }))
vi.mock('../../components/CameraCaptureSection', () => ({
  default: () => <div>seção captura</div>,
}))
vi.mock('../../components/CameraRecordingSection', () => ({
  default: () => <div>seção gravação</div>,
}))
vi.mock('../../components/CameraTransmissionSection', () => ({
  default: () => <div>seção transmissão</div>,
}))
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

afterEach(() => {
  cleanup()
  vi.mocked(getRole).mockReturnValue('admin')
})

function renderAt(path: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })),
  )
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/cameras/:id" element={<CameraDetailSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CameraDetailSettingsPage', () => {
  describe('CA6 (refactor/camera-detail-secoes-aplicar): câmera fica sempre editável pro admin, sem botão Editar nem alternância de rota', () => {
    it('subtítulo é só o nome da câmera — nunca "nome / Editar"', async () => {
      renderAt('/settings/cameras/cam-1')
      await waitFor(() => {
        const h3 = screen.getByRole('heading', { level: 3 })
        expect(h3.textContent).toBe('Corredor de entrada')
      })
    })

    it('não existe botão "Editar" — a página já mostra tudo editável', async () => {
      renderAt('/settings/cameras/cam-1')
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 3 })).toBeTruthy()
      })
      expect(document.getElementById('camera-edit')).toBeNull()
    })

    it('as 3 seções sempre-editáveis (Captura, Gravação, Transmissão) aparecem juntas, sem precisar de nenhuma interação', async () => {
      renderAt('/settings/cameras/cam-1')
      await waitFor(() => {
        expect(document.body.textContent).toContain('seção captura')
      })
      expect(document.body.textContent).toContain('seção gravação')
      expect(document.body.textContent).toContain('seção transmissão')
    })
  })

  describe('CA9: o botão "+ Nova câmera" aparece no PageHeader (mesma posição/estilo da lista /settings/cameras), não mais na linha das abas', () => {
    it('link "Nova câmera" presente, apontando pra /settings/cameras/new', async () => {
      renderAt('/settings/cameras/cam-1')
      await waitFor(() => {
        expect(document.getElementById('camera-create')).toBeTruthy()
      })
      expect(document.getElementById('camera-create')?.getAttribute('href')).toBe(
        '/settings/cameras/new',
      )
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

  describe('CA5: análise de objetos removida — sem sessão de análise por câmera', () => {
    it('não renderiza mais a sessão de análise (id camera-analysis-enabled)', async () => {
      renderAt('/settings/cameras/cam-1')
      await waitFor(() => {
        expect(document.getElementById('motion_enabled')).toBeTruthy()
      })
      expect(document.getElementById('camera-analysis-enabled')).toBeNull()
    })
  })

  describe('CA3: câmera legada com capture_type=mjpeg (protocolo removido) cai no fallback RTSP', () => {
    it('mostra "RTSP" em vez de "MJPEG" pra um dado antigo do banco com capture_type=mjpeg', async () => {
      vi.mocked(getRole).mockReturnValue('viewer')
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  id: 'cam-1',
                  name: 'Portão',
                  rtsp_url: 'https://195.196.36.242/mjpg/video.mjpg',
                  capture_type: 'mjpeg',
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
                  motion: null,
                },
              ]),
          }),
        ),
      )

      render(
        <MemoryRouter initialEntries={['/settings/cameras/cam-1']}>
          <Routes>
            <Route path="/settings/cameras/:id" element={<CameraDetailSettingsPage />} />
          </Routes>
        </MemoryRouter>,
      )

      await waitFor(() => expect(screen.getByText('RTSP')).toBeTruthy())
      expect(screen.queryByText('MJPEG')).toBeNull()
      expect(screen.queryByText('URL MJPEG')).toBeNull()
    })
  })
})
