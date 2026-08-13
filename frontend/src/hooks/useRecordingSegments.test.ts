import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'

// Mesmo padrão de VideoBrowserPage.test.tsx: a RecordingsGateway captura globalThis.fetch
// no construtor e a instância nasce no nível do módulo — stubar fetch não a alcança.
// Mockamos o módulo do gateway com fns hoisted, controláveis por teste.
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

import { useRecordingSegments } from './useRecordingSegments'

beforeEach(() => {
  g.getTimezone.mockResolvedValue('UTC')
  g.getRecording.mockResolvedValue({ filename: '20260101120000.mp4', date: '2026-01-01' })
  g.listByDay.mockResolvedValue([
    {
      id: 1,
      filename: '20260101120000.mp4',
      start: '2026-01-01T12:00:00Z',
      url: '/r/1.mp4',
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

describe('CA2: useRecordingSegments — resolve cameraId+recordingId(/motionId) em VideoPlayerSegment[]', () => {
  it('cameraId/recordingId nulos → segments vazio, sem chamar o gateway', () => {
    const { result } = renderHook(() => useRecordingSegments(null, null))
    expect(result.current.segments).toEqual([])
    expect(g.getRecording).not.toHaveBeenCalled()
  })

  it('sem motionId → 1 segmento cobrindo o chunk-âncora inteiro [0, Infinity)', async () => {
    const { result } = renderHook(() => useRecordingSegments('cam1', 1))
    await waitFor(() => {
      expect(result.current.segments).toEqual([
        { src: '/r/1.mp4?token=fake', fromSeconds: 0, toSeconds: Infinity },
      ])
    })
  })

  it('com motionId → resolve o clip via clipSegments (janela lead/trail em torno do evento)', async () => {
    g.getEvent.mockResolvedValue({ id: 9, time: '2026-01-01T12:00:05Z', score: 1 })
    g.getPlaybackWindow.mockResolvedValue({ lead: 3, trail: 4 })
    const { result } = renderHook(() => useRecordingSegments('cam1', 1, 9))
    await waitFor(() => {
      expect(result.current.segments).toEqual([
        { src: '/r/1.mp4?token=fake', fromSeconds: 2, toSeconds: 9 },
      ])
      expect(result.current.event?.id).toBe(9)
    })
  })

  it('gravação não encontrada (getRecording → null) → error preenchido', async () => {
    g.getRecording.mockResolvedValue(null)
    const { result } = renderHook(() => useRecordingSegments('cam1', 999))
    await waitFor(() => {
      expect(result.current.error).toBe('Gravação não encontrada.')
    })
  })

  it('evento não encontrado (getEvent → null, com motionId) → error preenchido', async () => {
    g.getEvent.mockResolvedValue(null)
    const { result } = renderHook(() => useRecordingSegments('cam1', 1, 9))
    await waitFor(() => {
      expect(result.current.error).toBe('Evento não encontrado.')
    })
  })

  it('trocar de recordingId dispara nova resolução (re-fetch reativo)', async () => {
    const { result, rerender } = renderHook(({ cid, rid }) => useRecordingSegments(cid, rid), {
      initialProps: { cid: 'cam1', rid: 1 },
    })
    await waitFor(() => expect(result.current.segments.length).toBe(1))
    g.getRecording.mockResolvedValue({ filename: '20260102120000.mp4', date: '2026-01-02' })
    g.listByDay.mockResolvedValue([
      {
        id: 2,
        filename: '20260102120000.mp4',
        start: '2026-01-02T12:00:00Z',
        url: '/r/2.mp4',
        is_recording: false,
        has_motion: false,
      },
    ])
    rerender({ cid: 'cam1', rid: 2 })
    await waitFor(() => {
      expect(result.current.segments).toEqual([
        { src: '/r/2.mp4?token=fake', fromSeconds: 0, toSeconds: Infinity },
      ])
    })
  })
})

// --- capture_type-independente: chunk ativo cobrindo o evento (história
// fix/notificacao-gravacao-em-andamento) ---

describe('CA2-CA4: useRecordingSegments — estado pendente + retry quando um chunk ativo cobre a janela do evento', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const flushMicro = () =>
    act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })
  const tick = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })

  it('CA2: chunk ativo cobrindo a janela do evento entra em estado pendente e tenta de novo até achar segmento', async () => {
    g.getEvent.mockResolvedValue({ id: 9, time: '2026-01-01T12:00:05Z', score: 1 })
    g.getPlaybackWindow.mockResolvedValue({ lead: 3, trail: 4 })
    g.listByDay
      .mockResolvedValueOnce([
        {
          id: 2,
          filename: '20260101120000.mp4',
          start: '2026-01-01T12:00:00Z',
          url: '/r/2.mp4',
          is_recording: true,
          has_motion: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 2,
          filename: '20260101120000.mp4',
          start: '2026-01-01T12:00:00Z',
          url: '/r/2.mp4',
          is_recording: false,
          has_motion: false,
        },
      ])

    const { result } = renderHook(() => useRecordingSegments('cam1', 1, 9))
    await flushMicro()

    expect(result.current.pending).toBe(true)
    expect(result.current.error).toMatch(/[Gg]ravação em andamento/)
    expect(result.current.segments).toEqual([])

    await tick(5000)

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.segments.length).toBeGreaterThan(0)
    expect(g.listByDay).toHaveBeenCalledTimes(2)
  })

  it('CA3: nenhum chunk (ativo ou fechado) cobre a janela do evento → mensagem final imediata, sem retry', async () => {
    g.getRecording.mockResolvedValue({ filename: '20260101113000.mp4', date: '2026-01-01' })
    g.getEvent.mockResolvedValue({ id: 9, time: '2026-01-01T12:00:05Z', score: 1 })
    g.getPlaybackWindow.mockResolvedValue({ lead: 3, trail: 4 })
    g.listByDay.mockResolvedValue([
      {
        id: 1,
        filename: '20260101113000.mp4',
        start: '2026-01-01T11:30:00Z',
        end: '2026-01-01T11:35:00Z',
        url: '/r/1.mp4',
        is_recording: false,
        has_motion: false,
      },
      {
        id: 2,
        filename: '20260101130000.mp4',
        start: '2026-01-01T13:00:00Z',
        url: '/r/2.mp4',
        is_recording: false,
        has_motion: false,
      },
    ])

    const { result } = renderHook(() => useRecordingSegments('cam1', 1, 9))
    await flushMicro()

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBe('Sem gravação cobrindo o evento.')

    // Sem retry: avançar o relógio não deve disparar uma 2ª chamada.
    await tick(10000)
    expect(g.listByDay).toHaveBeenCalledTimes(1)
  })

  it('CA4: estourado o teto de retry (2 min) sem achar segmento, cai pra mensagem final e para de tentar', async () => {
    g.getEvent.mockResolvedValue({ id: 9, time: '2026-01-01T12:00:05Z', score: 1 })
    g.getPlaybackWindow.mockResolvedValue({ lead: 3, trail: 4 })
    g.listByDay.mockResolvedValue([
      {
        id: 2,
        filename: '20260101120000.mp4',
        start: '2026-01-01T12:00:00Z',
        url: '/r/2.mp4',
        is_recording: true,
        has_motion: false,
      },
    ])

    const { result } = renderHook(() => useRecordingSegments('cam1', 1, 9))
    await flushMicro()
    expect(result.current.pending).toBe(true)

    await tick(125000)

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBe('Sem gravação cobrindo o evento.')
  })
})
