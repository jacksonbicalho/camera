import { describe, it, expect, vi } from 'vitest'
import { RecordingsGateway, clipSegments, UNAUTHORIZED, type Recording } from './recordingsGateway'

function rec(overrides: Partial<Recording> & { start: string }): Recording {
  return {
    id: 0,
    filename: overrides.start.replace(/[-:TZ]/g, '').slice(0, 14) + '.mp4',
    url: '/recordings/cam1/x.mp4',
    is_recording: false,
    has_motion: false,
    ...overrides,
  }
}

function okResp(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response
}

describe('clipSegments', () => {
  // Três chunks contíguos de 5 min: A 10:00, B 10:05, C 10:10.
  const A = rec({ start: '2026-05-03T10:00:00Z' })
  const B = rec({ start: '2026-05-03T10:05:00Z' })
  const C = rec({ start: '2026-05-03T10:10:00Z' })

  it('atravessa a fronteira do chunk (cross-boundary)', () => {
    // evento 10:05:30, lead/trail 40s → janela [10:04:50, 10:06:10]
    const segs = clipSegments('2026-05-03T10:05:30Z', [A, B, C], 40, 40)
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ recording: A, fromSeconds: 290, toSeconds: 300 })
    expect(segs[1]).toMatchObject({ recording: B, fromSeconds: 0, toSeconds: 70 })
  })

  it('clampa fromSeconds em 0 quando o lead cai antes do início do chunk', () => {
    // único chunk A; evento 10:00:05, lead 30s → janela começa antes de 10:00
    const segs = clipSegments('2026-05-03T10:00:05Z', [A], 30, 10)
    expect(segs).toHaveLength(1)
    expect(segs[0].fromSeconds).toBe(0)
    expect(segs[0].toSeconds).toBe(15)
  })

  it('pula o chunk is_recording (não é arquivo seekável)', () => {
    const liveB = rec({ start: '2026-05-03T10:05:00Z', is_recording: true })
    // evento no fim de A (10:04:50), trail 40s → janela entra em B, que é live
    const segs = clipSegments('2026-05-03T10:04:50Z', [A, liveB], 40, 40)
    expect(segs).toHaveLength(1)
    expect(segs[0].recording).toBe(A)
    expect(segs[0].toSeconds).toBe(300) // capado no start do próximo (10:05)
  })

  it('pula chunks fora da janela (vão)', () => {
    const far = rec({ start: '2026-05-03T11:00:00Z' })
    const segs = clipSegments('2026-05-03T10:00:10Z', [A, far], 20, 20)
    expect(segs).toHaveLength(1)
    expect(segs[0].recording).toBe(A)
  })

  it('devolve vazio para timestamp inválido', () => {
    expect(clipSegments('não-é-data', [A], 10, 10)).toEqual([])
  })
})

describe('RecordingsGateway', () => {
  it('listByDay busca o dia inteiro e devolve as gravações', async () => {
    const recs = [rec({ start: '2026-05-03T10:00:00Z' })]
    const fetchFn = vi.fn().mockResolvedValue(okResp({ recordings: recs }))
    const gw = new RecordingsGateway({ fetchFn })

    const out = await gw.listByDay('cam1', new Date(2026, 4, 3), 'asc')

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('/api/cameras/cam1/recordings?date=2026-05-03'),
      expect.anything(),
    )
    expect(fetchFn.mock.calls[0][0]).toContain('limit=0')
    expect(fetchFn.mock.calls[0][0]).toContain('order=asc')
    expect(out).toEqual(recs)
  })

  it('listByDay devolve UNAUTHORIZED no 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResp({}, 401))
    const gw = new RecordingsGateway({ fetchFn })
    expect(await gw.listByDay('cam1', new Date(2026, 4, 3))).toBe(UNAUTHORIZED)
  })

  it('getRecording devolve {filename, date}', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResp({ filename: '20260503100000.mp4', date: '2026-05-03' }))
    const gw = new RecordingsGateway({ fetchFn })
    const out = await gw.getRecording('cam1', 42)
    expect(fetchFn).toHaveBeenCalledWith('/api/cameras/cam1/recordings/by-id/42', expect.anything())
    expect(out).toEqual({ filename: '20260503100000.mp4', date: '2026-05-03' })
  })

  it('getRecording devolve null quando não encontrado', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResp({}, 404))
    const gw = new RecordingsGateway({ fetchFn })
    expect(await gw.getRecording('cam1', 42)).toBeNull()
  })

  it('getEvent busca o evento pelo id', async () => {
    const ev = { id: 7, time: '2026-05-03T10:05:30Z', score: 0.5, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }
    const fetchFn = vi.fn().mockResolvedValue(okResp(ev))
    const gw = new RecordingsGateway({ fetchFn })
    const out = await gw.getEvent(7)
    expect(fetchFn).toHaveBeenCalledWith('/api/events/7', expect.anything())
    expect(out).toEqual(ev)
  })

  it('getEvent devolve null no 404', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResp({}, 404))
    const gw = new RecordingsGateway({ fetchFn })
    expect(await gw.getEvent(7)).toBeNull()
  })

  it('getPlaybackWindow extrai lead/trail da câmera', async () => {
    const cams = [
      { id: 'cam0', playback_lead_seconds: 1, playback_trail_seconds: 2 },
      { id: 'cam1', playback_lead_seconds: 5, playback_trail_seconds: 10 },
    ]
    const fetchFn = vi.fn().mockResolvedValue(okResp(cams))
    const gw = new RecordingsGateway({ fetchFn })
    expect(await gw.getPlaybackWindow('cam1')).toEqual({ lead: 5, trail: 10 })
  })

  it('getPlaybackWindow cai no default 10/10 quando a câmera não está na lista', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResp([{ id: 'outra' }]))
    const gw = new RecordingsGateway({ fetchFn })
    expect(await gw.getPlaybackWindow('cam1')).toEqual({ lead: 10, trail: 10 })
  })

  it('playbackURL anexa o token à url servível', () => {
    const gw = new RecordingsGateway({ fetchFn: vi.fn() })
    const url = gw.playbackURL(rec({ start: '2026-05-03T10:00:00Z', url: '/recordings/cam1/a.mp4' }))
    expect(url.startsWith('/recordings/cam1/a.mp4?token=')).toBe(true)
  })
})
