import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react'

const g = vi.hoisted(() => ({
  getTimezone: vi.fn(),
  getRecording: vi.fn(),
  listByDay: vi.fn(),
  getEvent: vi.fn(),
  getPlaybackWindow: vi.fn(),
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
      playbackURL = (r: { url: string }) => `${r.url}?token=fake`
    },
  }
})

import RecordingPlayerModal from './RecordingPlayerModal'

beforeEach(() => {
  g.getTimezone.mockResolvedValue('UTC')
  g.getRecording.mockResolvedValue({ filename: 'a.mp4', date: '2026-01-01' })
  g.listByDay.mockResolvedValue([
    {
      id: 1,
      filename: 'a.mp4',
      start: '2026-01-01T12:00:00Z',
      url: '/r/a.mp4',
      is_recording: false,
      has_motion: false,
    },
  ])
  g.getEvent.mockResolvedValue(null)
  g.getPlaybackWindow.mockResolvedValue({ lead: 5, trail: 10 })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CA3: RecordingPlayerModal — reproduz uma gravação em modal, sem sair da página', () => {
  it('open=false não renderiza nada', () => {
    render(<RecordingPlayerModal open={false} cameraId="cam1" recordingId={1} onClose={vi.fn()} />)
    expect(document.getElementById('recording-player-modal')).toBeNull()
  })

  it('open=true renderiza o player com os segmentos resolvidos (via useRecordingSegments)', async () => {
    render(<RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal')).not.toBeNull()
      expect(document.getElementById('recording-player-video')).not.toBeNull()
    })
  })

  it('clicar no botão de fechar chama onClose', async () => {
    const onClose = vi.fn()
    render(<RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={onClose} />)
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal-close')).not.toBeNull()
    })
    fireEvent.click(document.getElementById('recording-player-modal-close')!)
    expect(onClose).toHaveBeenCalled()
  })

  it('clicar no backdrop (fora do conteúdo) chama onClose', async () => {
    const onClose = vi.fn()
    render(<RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={onClose} />)
    const modal = await waitFor(() => {
      const el = document.getElementById('recording-player-modal')
      if (!el) throw new Error('modal não renderizou')
      return el
    })
    fireEvent.click(modal)
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape chama onClose', async () => {
    const onClose = vi.fn()
    render(<RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={onClose} />)
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal')).not.toBeNull()
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('gravação não encontrada → mostra o banner de erro dentro do modal', async () => {
    g.getRecording.mockResolvedValue(null)
    render(<RecordingPlayerModal open cameraId="cam1" recordingId={999} onClose={vi.fn()} />)
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal-error')?.textContent).toContain(
        'não encontrada',
      )
    })
  })
})
