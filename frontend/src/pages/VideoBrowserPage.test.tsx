import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

vi.mock('../lib/recordingsGateway', async importOriginal => {
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
    // Link "Ao vivo" no header → /live/{cameraId}.
    expect(document.getElementById('video-browser-live-link')?.getAttribute('href')).toBe(
      '/live/cam1',
    )
  })

  it('marca a barra de controles com data-on-video (branca sobre o vídeo no modo claro)', async () => {
    renderAt('/recording/cam1/1')
    await waitFor(() => {
      const controls = document.getElementById('video-browser-controls')
      expect(controls).toBeTruthy()
      expect(controls!.hasAttribute('data-on-video')).toBe(true)
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
