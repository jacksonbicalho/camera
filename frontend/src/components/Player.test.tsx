import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import Player from './Player'
import { retryPlan, RETRY_MAX_ATTEMPTS } from './playerRetry'

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
vi.mock('../auth', () => ({ getToken: () => 'fake-token' }))
vi.mock('../lib/webrtc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/webrtc')>()
  return { ...actual, negotiateWebRTC: vi.fn() }
})

let rtcCalled = 0
let rtcInstances: { connectionState: string; onconnectionstatechange: (() => void) | null }[] = []
function stubRTC() {
  rtcCalled = 0
  rtcInstances = []
  hlsInstances.length = 0
  vi.stubGlobal('RTCPeerConnection', function RTCPeerConnectionStub() {
    rtcCalled++
    const inst = {
      connectionState: 'new',
      ontrack: null,
      onconnectionstatechange: null as (() => void) | null,
      addTransceiver: vi.fn(),
      close: vi.fn(),
    }
    rtcInstances.push(inst)
    return inst
  })
}
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

beforeEach(() => stubRTC())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Player', () => {
  it('renderiza o <video> com o id dado', () => {
    render(<Player id="p1" src="/stream/cam1/index.m3u8" />)
    expect(document.getElementById('p1')?.tagName).toBe('VIDEO')
  })

  it('transport="hls" pula o WebRTC (não constrói RTCPeerConnection)', async () => {
    render(<Player id="p1" src="/stream/cam1/index.m3u8" cameraId="cam1" transport="hls" />)
    await flush()
    expect(rtcCalled).toBe(0)
  })

  it('botão de tela cheia chama requestFullscreen no container', async () => {
    const rfs = vi.fn().mockResolvedValue(undefined)
    ;(
      HTMLElement.prototype as unknown as { requestFullscreen: () => Promise<void> }
    ).requestFullscreen = rfs
    render(<Player id="p1" src="/stream/cam1/index.m3u8" />)
    await flush()
    const btn = document.getElementById('p1-fullscreen')
    expect(btn).toBeTruthy()
    act(() => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rfs).toHaveBeenCalled()
  })

  it('mostra loading até o <video> ter um frame pra mostrar — conectar sozinho não basta', async () => {
    render(<Player id="p3" src="/stream/cam1/index.m3u8" cameraId="cam1" />)
    await flush()
    expect(document.getElementById('p3-loading')).not.toBeNull()

    // Conectar (WebRTC) não esconde o loading — ainda passa um tempo de tela preta
    // até o browser decodificar o 1º frame.
    act(() => {
      rtcInstances[0].connectionState = 'connected'
      rtcInstances[0].onconnectionstatechange?.()
    })
    expect(document.getElementById('p3-loading')).not.toBeNull()

    // Só some quando o <video> de fato carrega dados (onLoadedData).
    act(() => {
      document.getElementById('p3')!.dispatchEvent(new Event('loadeddata'))
    })
    expect(document.getElementById('p3-loading')).toBeNull()
  })

  it('mostra loading até o <video> ter um frame (transport="hls") — manifest parsear não basta', async () => {
    render(<Player id="p4" src="/stream/cam1/index.m3u8" cameraId="cam1" transport="hls" />)
    await flush()
    expect(document.getElementById('p4-loading')).not.toBeNull()

    act(() => {
      hlsInstances[hlsInstances.length - 1].handlers['manifestParsed']?.()
    })
    expect(document.getElementById('p4-loading')).not.toBeNull()

    act(() => {
      document.getElementById('p4')!.dispatchEvent(new Event('loadeddata'))
    })
    expect(document.getElementById('p4-loading')).toBeNull()
  })
})

describe('retryPlan — backoff exponencial com teto', () => {
  it('dobra o atraso até o cap de 30s', () => {
    expect(retryPlan(0)).toEqual({ delay: 2000, giveUp: false })
    expect(retryPlan(1)).toEqual({ delay: 4000, giveUp: false })
    expect(retryPlan(2)).toEqual({ delay: 8000, giveUp: false })
    expect(retryPlan(3)).toEqual({ delay: 16000, giveUp: false })
    expect(retryPlan(4)).toEqual({ delay: 30000, giveUp: false }) // 32s → cap 30s
    expect(retryPlan(5)).toEqual({ delay: 30000, giveUp: false })
  })

  it('desiste após RETRY_MAX_ATTEMPTS (sem loop infinito)', () => {
    expect(retryPlan(RETRY_MAX_ATTEMPTS)).toEqual({ delay: 0, giveUp: true })
    expect(retryPlan(RETRY_MAX_ATTEMPTS + 3).giveUp).toBe(true)
  })
})
