import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// A RecordingsGateway captura globalThis.fetch no construtor e a instância nasce no
// nível do módulo de VideoBrowserPage — então stubar fetch não a alcança. Mockamos o
// módulo do gateway com fns hoisted, controláveis por teste.
const g = vi.hoisted(() => ({
  getTimezone: vi.fn(),
  getRecording: vi.fn(),
  listByDay: vi.fn(),
  getEvent: vi.fn(),
  getPlaybackWindow: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markRead: vi.fn(),
    markSelectedRead: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
    removeSelected: vi.fn(),
    browserSupported: false,
    browserPermission: 'default',
    browserEnabled: false,
    enableBrowserNotifications: vi.fn(),
    disableBrowserNotifications: vi.fn(),
  }),
}))

vi.mock('../lib/recordingsGateway', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/recordingsGateway')>()
  return {
    ...actual,
    RecordingsGateway: class {
      getTimezone = g.getTimezone
      getRecording = g.getRecording
      listByDay = g.listByDay
      getEvent = g.getEvent
      getPlaybackWindow = g.getPlaybackWindow
      playbackURL = () => 'blob:fake'
    },
  }
})

import VideoBrowserPage from './VideoBrowserPage'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/recording/:cameraId/:recordingId" element={<VideoBrowserPage />} />
        <Route path="/recording/:cameraId/:recordingId/:motionId" element={<VideoBrowserPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  g.getTimezone.mockResolvedValue('UTC')
  g.getRecording.mockResolvedValue({ filename: '20260101120000.mp4', date: '2026-01-01' })
  g.listByDay.mockResolvedValue([
    { id: 1, filename: '20260101120000.mp4', start: '2026-01-01T12:00:00Z' },
  ])
  g.getEvent.mockResolvedValue(null)
  g.getPlaybackWindow.mockResolvedValue({ lead: 5, trail: 10 })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('VideoBrowserPage — estrutura visual', () => {
  it('cabeçalho "Reprodução" (#video-browser-header) acima do conteúdo centrado', async () => {
    renderAt('/recording/cam1/1')
    await waitFor(() => {
      const header = document.getElementById('video-browser-header')
      expect(header).toBeTruthy()
      expect(header!.textContent).toContain('Reprodução')
    })
    const content = document.getElementById('video-browser-content')!
    expect(content.className).toContain('page-content')
    // #video-browser-meta foi removido (era redundante com o subtítulo do header).
    expect(document.getElementById('video-browser-meta')).toBeNull()
  })

  describe('CA2: nenhum link do app leva pra página Ao vivo por câmera (/live/:cameraId)', () => {
    it('cabeçalho de Reprodução não tem mais o link "Ao vivo" pra /live/:cameraId', async () => {
      renderAt('/recording/cam1/1')
      await waitFor(() => {
        expect(document.getElementById('video-browser-header')).not.toBeNull()
      })
      expect(document.getElementById('video-browser-live-link')).toBeNull()
      expect(document.querySelector('a[href="/live/cam1"]')).toBeNull()
    })
  })

  it('rodapé de controles é sempre visível e theme-aware (sem data-on-video/cor fixa — rodapé, não overlay sobre o vídeo)', async () => {
    renderAt('/recording/cam1/1')
    await waitFor(() => {
      const controls = document.getElementById('video-browser-controls')
      expect(controls).toBeTruthy()
      expect(controls!.hasAttribute('data-on-video')).toBe(false)
      expect(controls!.className).toContain('bg-surface')
    })
  })

  it('erro renderiza como bloco de alerta (tokens danger)', async () => {
    g.getRecording.mockResolvedValue(null) // → setError('Gravação não encontrada.')
    renderAt('/recording/cam1/1')
    const err = await waitFor(() => {
      const el = document.getElementById('video-browser-error')
      if (!el) throw new Error('erro não renderizou')
      return el
    })
    expect(err.className).toContain('border-danger/40')
    expect(err.textContent).toContain('não encontrada')
  })
})

describe('VideoBrowserPage — StrictMode (efeito de carga duplicado no mount em dev)', () => {
  it('a chamada fantasma do StrictMode é abortada de verdade (signal.aborted), e o contador de segmento só reflete os dados da chamada real', async () => {
    const realDayRecs = [
      {
        id: 1,
        filename: '20260101120000.mp4',
        start: '2026-01-01T12:00:00Z',
        end: '2026-01-01T12:00:20Z',
        url: '/r/1.mp4',
        is_recording: false,
        has_motion: true,
      },
      {
        id: 2,
        filename: '20260101120020.mp4',
        start: '2026-01-01T12:00:20Z',
        end: '2026-01-01T12:00:40Z',
        url: '/r/2.mp4',
        is_recording: false,
        has_motion: false,
      },
      {
        id: 3,
        filename: '20260101120040.mp4',
        start: '2026-01-01T12:00:40Z',
        url: '/r/3.mp4',
        is_recording: false,
        has_motion: false,
      },
    ]
    const signals: (AbortSignal | undefined)[] = []
    g.getEvent.mockResolvedValue({ id: 1, time: '2026-01-01T12:00:30Z', score: 1 })
    g.getPlaybackWindow.mockResolvedValue({ lead: 30, trail: 30 })
    g.listByDay.mockImplementation((..._args: unknown[]) => {
      const signal = _args[3] as AbortSignal | undefined
      signals.push(signal)
      // 1ª chamada (fantasma do StrictMode): nunca resolve por conta própria — só rejeita
      // se abortada de verdade, simulando um fetch real em andamento sendo cancelado.
      if (signals.length === 1) {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      }
      // 2ª chamada (real): resolve com os dados de verdade.
      return Promise.resolve(realDayRecs)
    })

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/recording/cam1/1/1']}>
          <Routes>
            <Route
              path="/recording/:cameraId/:recordingId/:motionId"
              element={<VideoBrowserPage />}
            />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )

    await waitFor(() => {
      expect(document.getElementById('video-browser-segment')?.textContent).toBe('1 / 3')
    })
    expect(signals).toHaveLength(2)
    expect(signals[0]?.aborted).toBe(true)
  })
})
