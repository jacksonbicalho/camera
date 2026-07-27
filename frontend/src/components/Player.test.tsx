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
let rtcInstances: {
  connectionState: string
  onconnectionstatechange: (() => void) | null
  addTransceiver: ReturnType<typeof vi.fn>
}[] = []
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

  it('negociação WebRTC oferta transceiver de vídeo E de áudio (recvonly) — câmera pode ter G.711', async () => {
    render(<Player id="p1" src="/stream/cam1/index.m3u8" cameraId="cam1" />)
    await flush()
    const kinds = rtcInstances[0].addTransceiver.mock.calls.map((c: unknown[]) => c[0])
    expect(kinds).toContain('video')
    expect(kinds).toContain('audio')
    expect(rtcInstances[0].addTransceiver).toHaveBeenCalledWith('audio', { direction: 'recvonly' })
  })

  it('sem title, controls e footerTrailing, não renderiza rodapé (uso do AllCamerasPage — thumbnail sem chrome)', async () => {
    render(<Player id="p1" src="/stream/cam1/index.m3u8" />)
    await flush()
    expect(document.getElementById('p1-footer')).toBeNull()
    expect(document.getElementById('p1-fullscreen')).toBeNull()
    expect(document.getElementById('p1-mute')).toBeNull()
  })

  describe('CA4: rodapé usa o componente Zoom (−/%/+) em vez do chip PlayerControlsOverlay', () => {
    it('com controls, o rodapé mostra o controle de zoom (100% por padrão, sem zoom ainda)', async () => {
      render(<Player id="p1" src="/stream/cam1/index.m3u8" controls />)
      await flush()
      expect(document.getElementById('p1-zoom-out')).toBeTruthy()
      expect(document.getElementById('p1-zoom-in')).toBeTruthy()
      expect(document.getElementById('p1-zoom-level')?.textContent).toBe('100%')
      // Chip antigo (PlayerControlsOverlay), sobreposto ao vídeo, não existe mais.
      expect(document.getElementById('p1-zoom-reset')).toBeNull()
    })

    it('sem controls, o controle de zoom não aparece (mesmo critério dos outros botões do rodapé)', async () => {
      render(<Player id="p1" src="/stream/cam1/index.m3u8" />)
      await flush()
      expect(document.getElementById('p1-zoom-out')).toBeNull()
      expect(document.getElementById('p1-zoom-in')).toBeNull()
      expect(document.getElementById('p1-zoom-level')).toBeNull()
    })
  })

  describe('CA5: rodapé existe sem `title`, desde que haja controls ou footerTrailing', () => {
    it('sem title mas com controls, rodapé existe (mudo/tela cheia) sem mostrar nome', async () => {
      render(<Player id="p1" src="/stream/cam1/index.m3u8" controls />)
      await flush()
      const footer = document.getElementById('p1-footer')
      expect(footer).toBeTruthy()
      expect(footer!.textContent).not.toContain('Corredor de entrada')
      expect(document.getElementById('p1-mute')).toBeTruthy()
      expect(document.getElementById('p1-fullscreen')).toBeTruthy()
    })

    it('sem title e sem controls, mas com footerTrailing, rodapé existe mesmo assim', async () => {
      render(
        <Player
          id="p1"
          src="/stream/cam1/index.m3u8"
          footerTrailing={<span id="p1-tabs">tabs</span>}
        />,
      )
      await flush()
      expect(document.getElementById('p1-footer')).toBeTruthy()
      expect(document.getElementById('p1-tabs')).toBeTruthy()
    })
  })

  it('com title, mostra o rodapé com o nome — sem controls, sem botões', async () => {
    render(<Player id="p1" src="/stream/cam1/index.m3u8" title="Corredor de entrada" />)
    await flush()
    const footer = document.getElementById('p1-footer')
    expect(footer).toBeTruthy()
    expect(footer!.textContent).toContain('Corredor de entrada')
    expect(document.getElementById('p1-fullscreen')).toBeNull()
    expect(document.getElementById('p1-mute')).toBeNull()
  })

  it('com title e controls, botão de tela cheia (no rodapé) chama requestFullscreen no container do vídeo', async () => {
    const rfs = vi.fn().mockResolvedValue(undefined)
    ;(
      HTMLElement.prototype as unknown as { requestFullscreen: () => Promise<void> }
    ).requestFullscreen = rfs
    render(<Player id="p1" src="/stream/cam1/index.m3u8" title="Corredor de entrada" controls />)
    await flush()
    const btn = document.getElementById('p1-fullscreen')
    expect(btn).toBeTruthy()
    expect(document.getElementById('p1-footer')?.contains(btn)).toBe(true)
    act(() => {
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rfs).toHaveBeenCalled()
  })

  it('com title e controls, botão de mudo alterna video.muted e o ícone', async () => {
    render(<Player id="p1" src="/stream/cam1/index.m3u8" title="Corredor de entrada" controls />)
    await flush()
    const video = document.getElementById('p1') as HTMLVideoElement
    const btn = document.getElementById('p1-mute')!
    expect(video.muted).toBe(true)
    expect(btn.getAttribute('aria-label')).toBe('Ativar som')

    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(video.muted).toBe(false)
    expect(btn.getAttribute('aria-label')).toBe('Mudo')

    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(video.muted).toBe(true)
    expect(btn.getAttribute('aria-label')).toBe('Ativar som')
  })

  it('children renderiza dentro do div do vídeo (overlay tipo badge "AO VIVO")', async () => {
    render(
      <Player id="p1" src="/stream/cam1/index.m3u8">
        <span id="p1-badge">AO VIVO</span>
      </Player>,
    )
    await flush()
    const badge = document.getElementById('p1-badge')
    expect(badge).not.toBeNull()
    const video = document.getElementById('p1')!
    expect(video.parentElement?.contains(badge)).toBe(true)
  })

  it('com title e controls dentro de um ancestral clicável, clicar em mudo/tela cheia não propaga o clique', async () => {
    const onOuterClick = vi.fn()
    ;(
      HTMLElement.prototype as unknown as { requestFullscreen: () => Promise<void> }
    ).requestFullscreen = vi.fn().mockResolvedValue(undefined)
    render(
      <div onClick={onOuterClick}>
        <Player id="p1" src="/stream/cam1/index.m3u8" title="Corredor de entrada" controls />
      </div>,
    )
    await flush()

    act(() => {
      document.getElementById('p1-mute')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOuterClick).not.toHaveBeenCalled()

    act(() => {
      document
        .getElementById('p1-fullscreen')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onOuterClick).not.toHaveBeenCalled()
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

  it('footerTrailing: renderiza dentro do rodapé, como último elemento (depois de mudo/tela cheia)', async () => {
    render(
      <Player
        id="p1"
        src="/stream/cam1/index.m3u8"
        title="Corredor de entrada"
        controls
        footerTrailing={<span id="p1-tabs">tabs</span>}
      />,
    )
    await flush()
    const footer = document.getElementById('p1-footer')!
    const tabs = document.getElementById('p1-tabs')!
    expect(footer.contains(tabs)).toBe(true)
    const actions = Array.from(footer.querySelectorAll('button, #p1-tabs'))
    expect(actions[actions.length - 1]).toBe(tabs)
  })

  it('footerTrailing: renderiza mesmo sem controls (sem mudo/tela cheia)', async () => {
    render(
      <Player
        id="p1"
        src="/stream/cam1/index.m3u8"
        title="Corredor de entrada"
        footerTrailing={<span id="p1-tabs">tabs</span>}
      />,
    )
    await flush()
    expect(document.getElementById('p1-footer')?.contains(document.getElementById('p1-tabs'))).toBe(
      true,
    )
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
