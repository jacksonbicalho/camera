import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlayerSnapshot } from './usePlayerSnapshot'

// jsdom não implementa canvas de verdade (getContext/toBlob) — mocka o mínimo pro hook
// desenhar o frame e converter pra blob sem precisar de um <canvas> real.
function stubCanvas() {
  const drawImage = vi.fn()
  const toBlobMock = vi.fn(function (this: HTMLCanvasElement, cb: (b: Blob | null) => void) {
    cb(new Blob(['fake'], { type: 'image/png' }))
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D)
  HTMLCanvasElement.prototype.toBlob =
    toBlobMock as unknown as typeof HTMLCanvasElement.prototype.toBlob
  return { drawImage, toBlobMock }
}

describe('usePlayerSnapshot', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:fake-url')
    revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    clickSpy = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function fakeVideo(): HTMLVideoElement {
    const video = document.createElement('video')
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true })
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true })
    return video
  }

  it('sem vídeo (getVideoEl devolve null), não faz nada', () => {
    stubCanvas()
    const { result } = renderHook(() => usePlayerSnapshot(() => null))
    act(() => result.current.takeSnapshot())
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('com vídeo, desenha o frame no canvas (dimensões do vídeo) e dispara o download', () => {
    const { drawImage, toBlobMock } = stubCanvas()
    const video = fakeVideo()
    const { result } = renderHook(() => usePlayerSnapshot(() => video))
    act(() => result.current.takeSnapshot())

    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360)
    expect(toBlobMock).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    expect(createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('nome do arquivo inclui o prefixo dado (ex.: nome da câmera)', () => {
    stubCanvas()
    const video = fakeVideo()
    const { result } = renderHook(() => usePlayerSnapshot(() => video, 'Corredor'))
    let downloadName = ''
    const original = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = original(tag)
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          set(v: string) {
            downloadName = v
          },
          get() {
            return downloadName
          },
        })
      }
      return el
    })
    act(() => result.current.takeSnapshot())
    expect(downloadName.startsWith('Corredor-')).toBe(true)
    expect(downloadName.endsWith('.png')).toBe(true)
  })
})
