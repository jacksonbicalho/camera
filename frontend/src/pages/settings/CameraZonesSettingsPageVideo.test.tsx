import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CameraZonesSettingsPage from './CameraZonesSettingsPage'

const { hlsInstances } = vi.hoisted(() => ({
  hlsInstances: [] as { handlers: Record<string, (...args: unknown[]) => void> }[],
}))

vi.mock('hls.js', () => ({
  default: class {
    static isSupported() {
      return true
    }
    static Events = { MANIFEST_PARSED: 'manifestParsed', ERROR: 'error' }
    handlers: Record<string, (...args: unknown[]) => void> = {}
    constructor() {
      hlsInstances.push(this)
    }
    loadSource() {}
    attachMedia() {}
    on(event: string, cb: (...args: unknown[]) => void) {
      this.handlers[event] = cb
    }
    destroy() {}
  },
}))

vi.mock('../../auth', () => ({
  getRole: () => 'admin',
  authHeaders: () => ({}),
  getToken: () => 'fake-token',
}))

vi.mock('../../lib/webrtc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/webrtc')>()
  return { ...actual, negotiateWebRTC: vi.fn() }
})

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../../components/CameraSettingsTabs', () => ({ default: () => <div /> }))

import { negotiateWebRTC } from '../../lib/webrtc'

let mockLiveTransport = 'webrtc'
vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      cameras: [
        { id: 'cam1', live_transport: mockLiveTransport, motion: null, width: 640, height: 480 },
      ],
    },
  }),
}))

let rtcCalled = 0
function stubRTC() {
  rtcCalled = 0
  hlsInstances.length = 0
  vi.stubGlobal('RTCPeerConnection', function RTCPeerConnectionStub() {
    rtcCalled++
    return {
      connectionState: 'new',
      ontrack: null,
      onconnectionstatechange: null as (() => void) | null,
      addTransceiver: vi.fn(),
      close: vi.fn(),
    }
  })
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

beforeEach(() => {
  mockLiveTransport = 'webrtc'
  stubRTC()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/cameras/zones/cam1']}>
      <Routes>
        <Route path="/settings/cameras/zones/:id" element={<CameraZonesSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CameraZonesSettingsPage — fonte do vídeo ao vivo (WebRTC-first + fallback pro HLS)', () => {
  it('live_transport=webrtc tenta WebRTC primeiro, sem cair pro hls.js de cara', async () => {
    renderPage()
    await flush()
    expect(rtcCalled).toBe(1)
    expect(hlsInstances).toHaveLength(0)
  })

  it('falha na negociação WebRTC cai pro hls.js', async () => {
    vi.mocked(negotiateWebRTC).mockRejectedValueOnce(new Error('sem publisher'))
    renderPage()
    await flush()
    expect(rtcCalled).toBe(1)
    expect(hlsInstances).toHaveLength(1)
  })

  it('live_transport=hls vai direto pro hls.js, sem tentar WebRTC', async () => {
    mockLiveTransport = 'hls'
    renderPage()
    await flush()
    expect(rtcCalled).toBe(0)
    expect(hlsInstances).toHaveLength(1)
  })
})
