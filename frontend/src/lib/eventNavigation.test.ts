import { afterEach, describe, expect, it, vi } from 'vitest'
import { format } from 'date-fns'
import { resolveEventRecordingUrl } from './eventNavigation'

vi.mock('../auth', () => ({
  authHeaders: () => ({ Authorization: 'Bearer test' }),
}))

afterEach(() => { vi.unstubAllGlobals() })

const cameraId = 'cam1'
const isoTime = '2026-07-07T10:00:00Z'
const dateStr = format(new Date(isoTime), 'yyyy-MM-dd')

describe('resolveEventRecordingUrl', () => {
  it('com evento casado, resolve /recording/:cameraId/:recordingId/:motionId', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === `/api/cameras/${cameraId}/motion?date=${dateStr}`) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [{ id: 42, time: isoTime, score: 0.8 }] }) })
      }
      if (url.startsWith(`/api/cameras/${cameraId}/recordings?date=`)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ recordings: [{ id: 7, start: '2026-07-07T09:00:00Z' }] }) })
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }))

    const url = await resolveEventRecordingUrl(cameraId, isoTime)
    expect(url).toBe('/recording/cam1/7/42')
  })

  it('sem evento casado, resolve só /recording/:cameraId/:recordingId (sem motionId)', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/motion?date=')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
      if (url.includes('/recordings?date=')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ recordings: [{ id: 7, start: '2026-07-07T09:00:00Z' }] }) })
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }))

    const url = await resolveEventRecordingUrl(cameraId, isoTime)
    expect(url).toBe('/recording/cam1/7')
  })

  it('ignora entradas kind==="state" ao casar o evento (transição de estado não tem motion_events.id)', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/motion?date=')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [{ id: -3, time: isoTime, kind: 'state' }] }) })
      if (url.includes('/recordings?date=')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ recordings: [{ id: 7, start: '2026-07-07T09:00:00Z' }] }) })
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }))

    const url = await resolveEventRecordingUrl(cameraId, isoTime)
    expect(url).toBe('/recording/cam1/7')
  })

  it('sem nenhuma gravação no dia, devolve null', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/motion?date=')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [{ id: 42, time: isoTime }] }) })
      if (url.includes('/recordings?date=')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ recordings: [] }) })
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }))

    const url = await resolveEventRecordingUrl(cameraId, isoTime)
    expect(url).toBeNull()
  })

  it('escolhe a última gravação que começa antes do instante (âncora)', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/motion?date=')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) })
      if (url.includes('/recordings?date=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            recordings: [
              { id: 1, start: '2026-07-07T08:00:00Z' },
              { id: 2, start: '2026-07-07T09:30:00Z' },
              { id: 3, start: '2026-07-07T11:00:00Z' },
            ],
          }),
        })
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
    }))

    const url = await resolveEventRecordingUrl(cameraId, isoTime)
    expect(url).toBe('/recording/cam1/2')
  })

  it('falha de rede devolve null (não lança)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))))
    const url = await resolveEventRecordingUrl(cameraId, isoTime)
    expect(url).toBeNull()
  })
})
