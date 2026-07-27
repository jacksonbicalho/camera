import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import VideoPlayer, { type VideoPlayerSegment } from './VideoPlayer'

afterEach(() => {
  cleanup()
})

// Mocka a barra de progresso com uma largura fixa (jsdom/happy-dom não faz layout de
// verdade) — permite converter uma posição de arraste desejada (segundos) num `clientX`
// determinístico: fraction = segundos/total, clientX = fraction * BAR_WIDTH.
const BAR_WIDTH = 1000
function mockSeekBar() {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    right: BAR_WIDTH,
    width: BAR_WIDTH,
    top: 0,
    bottom: 12,
    height: 12,
    x: 0,
    y: 0,
    toJSON: () => {},
  }))
  return () => {
    Element.prototype.getBoundingClientRect = original
  }
}
function clientXFor(seconds: number, total: number): number {
  return (seconds / total) * BAR_WIDTH
}

function seg(src: string, fromSeconds: number, toSeconds: number): VideoPlayerSegment {
  return { src, fromSeconds, toSeconds }
}

// fireLoadedMetadata simula o browser terminando de carregar a metadata: `duration` é
// somente-leitura no <video> real, então sobrescrevemos com uma própria antes de disparar
// o evento que o VideoPlayer escuta.
function fireLoadedMetadata(el: HTMLVideoElement, duration: number) {
  Object.defineProperty(el, 'duration', { value: duration, configurable: true })
  el.dispatchEvent(new Event('loadedmetadata'))
}

describe('VideoPlayer', () => {
  it('sem segmentos: mostra a mensagem vazia e não renderiza nenhum <video>', () => {
    render(<VideoPlayer idPrefix="p" segments={[]} emptyMessage="Sem gravações." />)
    expect(document.getElementById('p')?.textContent).toContain('Sem gravações.')
    expect(document.querySelector('#p video')).toBeNull()
  })

  it('um segmento: carrega o src no elemento ativo do buffer duplo', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-video')).not.toBeNull()
    })
    const a = document.getElementById('p-video') as HTMLVideoElement
    expect(a.getAttribute('src')).toBe('a.mp4')
    // Sem múltiplos segmentos, o contador não aparece.
    expect(document.getElementById('p-segment')).toBeNull()
  })

  it('múltiplos segmentos: pré-carrega o próximo no elemento B e mostra o contador', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, 10), seg('b.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-video-b')).not.toBeNull()
    })
    const b = document.getElementById('p-video-b') as HTMLVideoElement
    expect(b.getAttribute('src')).toBe('b.mp4')
    expect(document.getElementById('p-segment')?.textContent).toBe('1 / 2')
  })

  it('segmentCounter=false: não mostra o contador mesmo com múltiplos segmentos (uso do HistoryPage)', async () => {
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, 10), seg('b.mp4', 0, Infinity)]}
        segmentCounter={false}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-video-b')).not.toBeNull()
    })
    expect(document.getElementById('p-segment')).toBeNull()
  })

  it('cruza a fronteira entre segmentos (double-buffering): troca o z-index pro elemento B ao alcançar toSeconds', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, 10), seg('b.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-video')).not.toBeNull()
    })
    const a = document.getElementById('p-video') as HTMLVideoElement
    fireLoadedMetadata(a, 10)
    expect(a.className).toContain('z-10')

    Object.defineProperty(a, 'currentTime', { value: 10, configurable: true })
    a.dispatchEvent(new Event('timeupdate'))

    await waitFor(() => {
      expect(document.getElementById('p-video-b')?.className).toContain('z-10')
    })
    expect(document.getElementById('p-video')?.className).toContain('z-0')
    expect(document.getElementById('p-segment')?.textContent).toBe('2 / 2')
  })

  it('onSegmentChange dispara com 0 ao carregar e com o novo índice ao cruzar a fronteira', async () => {
    const onSegmentChange = vi.fn()
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, 10), seg('b.mp4', 0, Infinity)]}
        onSegmentChange={onSegmentChange}
      />,
    )
    await waitFor(() => {
      expect(onSegmentChange).toHaveBeenCalledWith(0)
    })
    onSegmentChange.mockClear()

    const a = document.getElementById('p-video') as HTMLVideoElement
    fireLoadedMetadata(a, 10)
    Object.defineProperty(a, 'currentTime', { value: 10, configurable: true })
    a.dispatchEvent(new Event('timeupdate'))

    await waitFor(() => {
      expect(onSegmentChange).toHaveBeenCalledWith(1)
    })
  })

  it('troca de playlist reinicia o índice — onSegmentChange dispara com 0 de novo', async () => {
    const onSegmentChange = vi.fn()
    const { rerender } = render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, 10), seg('b.mp4', 0, Infinity)]}
        onSegmentChange={onSegmentChange}
      />,
    )
    const a = document.getElementById('p-video') as HTMLVideoElement
    fireLoadedMetadata(a, 10)
    Object.defineProperty(a, 'currentTime', { value: 10, configurable: true })
    a.dispatchEvent(new Event('timeupdate'))
    await waitFor(() => {
      expect(onSegmentChange).toHaveBeenCalledWith(1)
    })
    onSegmentChange.mockClear()

    rerender(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('c.mp4', 0, Infinity)]}
        onSegmentChange={onSegmentChange}
      />,
    )
    await waitFor(() => {
      expect(onSegmentChange).toHaveBeenCalledWith(0)
    })
  })

  it('autoPlay=true (padrão): a intenção de tocar nasce ligada', async () => {
    const onPlayingChange = vi.fn()
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        onPlayingChange={onPlayingChange}
      />,
    )
    await waitFor(() => {
      expect(onPlayingChange).toHaveBeenCalledWith(true)
    })
  })

  it('autoPlay=false: nasce pausado', async () => {
    const onPlayingChange = vi.fn()
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        autoPlay={false}
        onPlayingChange={onPlayingChange}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-playpause')).not.toBeNull()
    })
    expect(onPlayingChange).toHaveBeenCalledWith(false)
    expect(onPlayingChange).not.toHaveBeenCalledWith(true)
  })

  it('botão play/pause alterna a intenção de reprodução', async () => {
    const onPlayingChange = vi.fn()
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        onPlayingChange={onPlayingChange}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-playpause')).not.toBeNull()
    })
    document
      .getElementById('p-playpause')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(onPlayingChange).toHaveBeenLastCalledWith(false)
    })
  })

  it('pause disparado pelo próprio elemento (fora de um clique no botão) também atualiza a intenção', async () => {
    const onPlayingChange = vi.fn()
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        onPlayingChange={onPlayingChange}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-video')).not.toBeNull()
    })
    onPlayingChange.mockClear()
    document.getElementById('p-video')!.dispatchEvent(new Event('pause'))
    await waitFor(() => {
      expect(onPlayingChange).toHaveBeenCalledWith(false)
    })
  })

  it('repeat ligado: ao terminar o clipe, reinicia em vez de parar', async () => {
    const onPlayingChange = vi.fn()
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        onPlayingChange={onPlayingChange}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-repeat')).not.toBeNull()
    })
    document.getElementById('p-repeat')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    // Espera o clique ser processado (repeatRef só é atualizado quando o updater de
    // estado roda) antes de disparar "ended" — senão a leitura do ref corre com o React.
    await waitFor(() => {
      expect(document.getElementById('p-repeat')?.getAttribute('aria-pressed')).toBe('true')
    })
    onPlayingChange.mockClear()
    document.getElementById('p-video')!.dispatchEvent(new Event('ended'))
    await waitFor(() => {
      expect(onPlayingChange).toHaveBeenCalledWith(true)
    })
  })

  it('repeat desligado (padrão): ao terminar o clipe, para a reprodução', async () => {
    const onPlayingChange = vi.fn()
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        onPlayingChange={onPlayingChange}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-video')).not.toBeNull()
    })
    onPlayingChange.mockClear()
    document.getElementById('p-video')!.dispatchEvent(new Event('ended'))
    await waitFor(() => {
      expect(onPlayingChange).toHaveBeenCalledWith(false)
    })
  })

  it('repeat desligado: ao terminar, a barra volta pro início (não fica cravada no fim) e o play volta a funcionar', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-video')).not.toBeNull()
    })
    const a = document.getElementById('p-video') as HTMLVideoElement
    fireLoadedMetadata(a, 10)
    a.dispatchEvent(new Event('ended'))
    await waitFor(() => {
      expect(document.getElementById('p-playpause')?.getAttribute('aria-label')).toBe('Reproduzir')
    })
    // Sem isso, a barra ficava cravada em "0:10 / 0:10" e apertar play não reproduzia nada
    // (o <video> já estava no seu próprio fim) — precisa voltar pro início de verdade.
    expect(document.getElementById('p-controls')?.textContent).toContain('0:00 / 0:10')

    const playSpy = vi.spyOn(a, 'play')
    document
      .getElementById('p-playpause')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(playSpy).toHaveBeenCalled()
  })

  it('repeat=false: some o botão de repetir', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} repeat={false} />)
    await waitFor(() => {
      expect(document.getElementById('p-playpause')).not.toBeNull()
    })
    expect(document.getElementById('p-repeat')).toBeNull()
  })

  it('botão de mudo: alterna e aplica aos dois elementos do buffer', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, 10), seg('b.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-video-b')).not.toBeNull()
    })
    const a = document.getElementById('p-video') as HTMLVideoElement
    const b = document.getElementById('p-video-b') as HTMLVideoElement
    expect(a.muted).toBe(true)
    document.getElementById('p-mute')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(a.muted).toBe(false)
    })
    expect(b.muted).toBe(false)
  })

  it('dropdown de velocidade: abre com o botão, lista 1x a 32x e aplica a escolha aos dois elementos do buffer', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, 10), seg('b.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-video-b')).not.toBeNull()
    })
    const a = document.getElementById('p-video') as HTMLVideoElement
    const b = document.getElementById('p-video-b') as HTMLVideoElement
    const btn = document.getElementById('p-speed')!
    expect(btn.textContent).toContain('1x')
    expect(a.playbackRate).toBe(1)
    expect(document.getElementById('p-speed-menu')).toBeNull()

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('p-speed-menu')).not.toBeNull()
    })
    // 1x, 2x, 4x, 8x, 16x, 32x — todas as opções listadas.
    for (const rate of [1, 2, 4, 8, 16, 32]) {
      expect(document.getElementById(`p-speed-${rate}`)).not.toBeNull()
    }

    document.getElementById('p-speed-8')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(btn.textContent).toContain('8x')
    })
    expect(a.playbackRate).toBe(8)
    expect(b.playbackRate).toBe(8)
    // Selecionar fecha o dropdown.
    expect(document.getElementById('p-speed-menu')).toBeNull()
  })

  it('dropdown de velocidade: lista do maior pro menor (32x no topo, 1x embaixo)', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
    document.getElementById('p-speed')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('p-speed-menu')).not.toBeNull()
    })
    const ids = Array.from(document.querySelectorAll('#p-speed-menu button')).map((el) => el.id)
    expect(ids).toEqual([
      'p-speed-32',
      'p-speed-16',
      'p-speed-8',
      'p-speed-4',
      'p-speed-2',
      'p-speed-1',
    ])
  })

  it('velocidade: quando o elemento não aplica 32x de verdade (browser sem suporte), cai pra 16x em vez de ficar mostrando "32x" tocando em outra velocidade', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-video')).not.toBeNull()
    })
    const a = document.getElementById('p-video') as HTMLVideoElement
    // Simula um browser que clampa acima de 16x (o dropdown já filtra 32x na detecção de
    // capacidade do browser em geral — isso testa a rede de segurança pro caso de um
    // elemento específico ainda assim rejeitar).
    let internalRate = 1
    Object.defineProperty(a, 'playbackRate', {
      get: () => internalRate,
      set: (v: number) => {
        internalRate = Math.min(v, 16)
      },
      configurable: true,
    })

    document.getElementById('p-speed')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('p-speed-32')).not.toBeNull()
    })
    document.getElementById('p-speed-32')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('p-speed')?.textContent).toContain('16x')
    })
    expect(a.playbackRate).toBe(16)
  })

  it('dropdown de velocidade: clicar fora fecha sem selecionar', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, 10)]} />)
    document.getElementById('p-speed')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('p-speed-menu')).not.toBeNull()
    })
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('p-speed-menu')).toBeNull()
    })
    expect(document.getElementById('p-speed')?.textContent).toContain('1x')
  })

  it('velocidade de reprodução é reaplicada sempre que um elemento carrega metadata (onMeta) — não só no momento da escolha', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, 10), seg('b.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-video-b')).not.toBeNull()
    })
    document.getElementById('p-speed')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('p-speed-4')).not.toBeNull()
    })
    document.getElementById('p-speed-4')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('p-speed')?.textContent).toContain('4x')
    })
    // Sem reaplicar no onMeta, o próximo segmento pré-carregado (loadInto → el.load())
    // voltaria pro playbackRate default (1x) ao assumir a tela — quebraria a velocidade
    // escolhida bem no meio da reprodução contínua, entre uma gravação e a seguinte.
    const b = document.getElementById('p-video-b') as HTMLVideoElement
    fireLoadedMetadata(b, 20)
    expect(b.playbackRate).toBe(4)
  })

  it('fullscreen: clique no botão chama requestFullscreen no container do player', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-fullscreen')).not.toBeNull()
    })
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    const container = document.getElementById('p') as unknown as {
      requestFullscreen: () => Promise<void>
    }
    container.requestFullscreen = requestFullscreen
    document
      .getElementById('p-fullscreen')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(requestFullscreen).toHaveBeenCalled()
  })

  it('onLoadedData/onError disparam a partir do elemento ativo', async () => {
    const onLoadedData = vi.fn()
    const onError = vi.fn()
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        onLoadedData={onLoadedData}
        onError={onError}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-video')).not.toBeNull()
    })
    document.getElementById('p-video')!.dispatchEvent(new Event('loadeddata'))
    expect(onLoadedData).toHaveBeenCalledTimes(1)
    document.getElementById('p-video')!.dispatchEvent(new Event('error'))
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('troca de playlist (nova referência de segments) recarrega o player', async () => {
    const { rerender } = render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect((document.getElementById('p-video') as HTMLVideoElement).getAttribute('src')).toBe(
        'a.mp4',
      )
    })
    rerender(<VideoPlayer idPrefix="p" segments={[seg('c.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect((document.getElementById('p-video') as HTMLVideoElement).getAttribute('src')).toBe(
        'c.mp4',
      )
    })
  })

  it('zoom=false: não renderiza o controle de zoom no rodapé', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} zoom={false} />)
    await waitFor(() => {
      expect(document.getElementById('p-video')).not.toBeNull()
    })
    expect(document.getElementById('p-zoom-out')).toBeNull()
    expect(document.getElementById('p-zoom-in')).toBeNull()
    expect(document.getElementById('p-zoom-level')).toBeNull()
  })

  describe('CA4: rodapé usa o componente Zoom (−/%/+) em vez do chip PlayerControlsOverlay', () => {
    it('com zoom habilitado (default), o rodapé mostra o controle de zoom — não o chip antigo sobreposto ao vídeo', async () => {
      render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
      await waitFor(() => {
        expect(document.getElementById('p-video')).not.toBeNull()
      })
      expect(document.getElementById('p-zoom-out')).not.toBeNull()
      expect(document.getElementById('p-zoom-in')).not.toBeNull()
      expect(document.getElementById('p-zoom-level')?.textContent).toBe('100%')
      expect(document.getElementById('p-zoom-reset')).toBeNull()
    })
  })

  describe('CA5: clicar em zoom in/out não reinicia a reprodução', () => {
    it('REGRESSÃO: clicar em zoom in/out NÃO reinicia a reprodução (bug real: o vídeo recarregava do zero a cada clique no zoom — reportado pelo navigator)', async () => {
      render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
      await waitFor(() => {
        expect(document.getElementById('p-video')).not.toBeNull()
      })
      const video = document.getElementById('p-video') as HTMLVideoElement
      fireLoadedMetadata(video, 100)
      const loadSpy = vi.spyOn(video, 'load')
      const srcBefore = video.getAttribute('src')
      fireEvent.click(document.getElementById('p-zoom-in')!)
      expect(loadSpy).not.toHaveBeenCalled()
      expect(video.getAttribute('src')).toBe(srcBefore)
      fireEvent.click(document.getElementById('p-zoom-out')!)
      expect(loadSpy).not.toHaveBeenCalled()
    })
  })

  describe('CA11: zoom persiste ao cruzar a fronteira entre segmentos (double-buffering)', () => {
    it('REGRESSÃO: zoom > 100% aplicado no segmento A continua > 100% depois de avançar pro segmento B', async () => {
      render(
        <VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, 10), seg('b.mp4', 0, Infinity)]} />,
      )
      await waitFor(() => {
        expect(document.getElementById('p-video')).not.toBeNull()
      })
      const a = document.getElementById('p-video') as HTMLVideoElement
      fireLoadedMetadata(a, 10)

      fireEvent.click(document.getElementById('p-zoom-in')!)
      await waitFor(() => {
        expect(document.getElementById('p-zoom-level')?.textContent).not.toBe('100%')
      })
      const levelBeforeAdvance = document.getElementById('p-zoom-level')?.textContent

      Object.defineProperty(a, 'currentTime', { value: 10, configurable: true })
      a.dispatchEvent(new Event('timeupdate'))

      await waitFor(() => {
        expect(document.getElementById('p-video-b')?.className).toContain('z-10')
      })
      expect(document.getElementById('p-zoom-level')?.textContent).toBe(levelBeforeAdvance)
      // Não basta o RÓTULO continuar > 100% — a transform CSS real precisa ter sido
      // reaplicada no elemento que assumiu (o outro buffer, que nunca tinha recebido nenhuma
      // transform até agora); sem isso o vídeo mostraria 100% de fato mesmo com o controle
      // marcando um valor maior (o mismatch visual que motivava o reset antigo).
      const bTransform = (document.getElementById('p-video-b') as HTMLVideoElement).style.transform
      expect(bTransform).not.toBe('')
      expect(bTransform).not.toContain('scale(1)')
    })
  })

  describe('CA12: zoom persiste ao reiniciar o clipe (loop)', () => {
    it('REGRESSÃO: zoom > 100% continua > 100% depois do clipe reiniciar (repeat ligado, evento ended)', async () => {
      render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
      await waitFor(() => {
        expect(document.getElementById('p-repeat')).not.toBeNull()
      })
      document.getElementById('p-repeat')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(document.getElementById('p-repeat')?.getAttribute('aria-pressed')).toBe('true')
      })

      fireEvent.click(document.getElementById('p-zoom-in')!)
      await waitFor(() => {
        expect(document.getElementById('p-zoom-level')?.textContent).not.toBe('100%')
      })
      const levelBeforeLoop = document.getElementById('p-zoom-level')?.textContent

      document.getElementById('p-video')!.dispatchEvent(new Event('ended'))
      await waitFor(() => {
        expect(document.getElementById('p-video')?.className).toContain('z-10')
      })
      expect(document.getElementById('p-zoom-level')?.textContent).toBe(levelBeforeLoop)
      // Mesmo motivo do assert extra em CA11 — o rótulo sozinho não garante que a transform
      // CSS de fato foi reaplicada no elemento 0 depois do reinício.
      const aTransform = (document.getElementById('p-video') as HTMLVideoElement).style.transform
      expect(aTransform).not.toBe('')
      expect(aTransform).not.toContain('scale(1)')
    })
  })

  it('rodapé de controles é sempre visível (não mais só no hover) e theme-aware — sem cor fixa/data-on-video', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
    await waitFor(() => {
      expect(document.getElementById('p-controls')).not.toBeNull()
    })
    const controls = document.getElementById('p-controls')!
    expect(controls.className).not.toMatch(/opacity-0|group-hover/)
    expect(controls.hasAttribute('data-on-video')).toBe(false)
    expect(controls.className).not.toMatch(/bg-black|text-white|from-black/)
    // O container theme-aware do rodapé é o PlayerFooter — bg-surface/text-foreground.
    const footer = controls.closest('[class*="bg-surface"]')
    expect(footer).not.toBeNull()
  })

  it('footerExtra: conteúdo extra da página (ex.: reprodução contínua/calendário do HistoryPage) aparece dentro do rodapé', async () => {
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        footerExtra={<div id="p-footer-extra-content">extra do rodapé</div>}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-controls')).not.toBeNull()
    })
    const extra = document.getElementById('p-footer-extra-content')
    expect(extra).not.toBeNull()
    expect(document.getElementById('p-controls')?.contains(extra)).toBe(true)
  })

  it('fullscreenPosition="afterSpeed": botão de tela cheia fica entre a velocidade e o footerExtra (uso do HistoryPage)', async () => {
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        fullscreenPosition="afterSpeed"
        footerExtra={<button id="p-continuous">continua</button>}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-fullscreen')).not.toBeNull()
    })
    const speed = document.getElementById('p-speed')!
    const fullscreen = document.getElementById('p-fullscreen')!
    const continuous = document.getElementById('p-continuous')!
    expect(
      speed.compareDocumentPosition(fullscreen) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      fullscreen.compareDocumentPosition(continuous) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('fullscreenPosition padrão ("trailing"): botão de tela cheia continua no fim da linha (uso do VideoBrowserPage)', async () => {
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        footerExtra={<button id="p-continuous">continua</button>}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-fullscreen')).not.toBeNull()
    })
    const continuous = document.getElementById('p-continuous')!
    const fullscreen = document.getElementById('p-fullscreen')!
    expect(
      continuous.compareDocumentPosition(fullscreen) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('footerEnd: renderiza dentro do rodapé, depois do botão de tela cheia (último elemento)', async () => {
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[seg('a.mp4', 0, Infinity)]}
        footerEnd={<span id="p-tabs">tabs</span>}
      />,
    )
    await waitFor(() => {
      expect(document.getElementById('p-fullscreen')).not.toBeNull()
    })
    const controls = document.getElementById('p-controls')!
    const fullscreen = document.getElementById('p-fullscreen')!
    const tabs = document.getElementById('p-tabs')!
    expect(controls.contains(tabs)).toBe(true)
    const position = fullscreen.compareDocumentPosition(tabs)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('footerEnd: renderiza mesmo sem segmentos (junto do emptyMessage)', () => {
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[]}
        emptyMessage="Sem gravações."
        footerEnd={<span id="p-tabs">tabs</span>}
      />,
    )
    expect(document.getElementById('p-tabs')).not.toBeNull()
  })

  it('overlay: conteúdo extra da página aparece por cima, inclusive sem segmentos (aditivo)', () => {
    render(
      <VideoPlayer
        idPrefix="p"
        segments={[]}
        emptyMessage="vazio"
        overlay={<div id="p-extra">extra</div>}
      />,
    )
    expect(document.getElementById('p-extra')).not.toBeNull()
  })

  it('arraste da barra de progresso dentro do MESMO segmento: só ajusta currentTime — sem recarregar/remontar o <video>', async () => {
    const restoreBar = mockSeekBar()
    try {
      render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
      await waitFor(() => {
        expect(document.getElementById('p-video')).not.toBeNull()
      })
      const a = document.getElementById('p-video') as HTMLVideoElement
      act(() => {
        fireLoadedMetadata(a, 20)
      })
      const srcBefore = a.getAttribute('src')
      Object.defineProperty(a, 'currentTime', { value: 0, writable: true, configurable: true })

      const seekBar = document.getElementById('p-seek')!
      await act(async () => {
        fireEvent.pointerDown(seekBar, { clientX: clientXFor(12, 20), pointerId: 1 })
        // O seek de fato no <video> é jogado pra requestAnimationFrame (throttle contra
        // seek storm ao arrastar) — a posição visual (`pos`) é síncrona, mas o
        // `currentTime` só é aplicado no próximo frame.
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })

      expect(a.currentTime).toBe(12)
      expect(a.getAttribute('src')).toBe(srcBefore) // não recarregou/remontou
    } finally {
      restoreBar()
    }
  })

  it('arraste rápido da barra de progresso só aplica currentTime UMA vez por frame — não pede seek mais rápido do que o decoder consegue acompanhar (reportado pelo navigator: vídeo "pisca" arrastando rápido, sobretudo pra trás)', async () => {
    const restoreBar = mockSeekBar()
    try {
      render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
      await waitFor(() => {
        expect(document.getElementById('p-video')).not.toBeNull()
      })
      const a = document.getElementById('p-video') as HTMLVideoElement
      act(() => {
        fireLoadedMetadata(a, 20)
      })
      let currentTimeSets = 0
      let currentTimeValue = 0
      Object.defineProperty(a, 'currentTime', {
        configurable: true,
        get: () => currentTimeValue,
        set: (v: number) => {
          currentTimeValue = v
          currentTimeSets += 1
        },
      })

      // Várias posições "no mesmo frame" (arraste rápido, dezenas de pointermove antes do
      // browser pintar) — só a ÚLTIMA posição deve resultar num currentTime real.
      const seekBar = document.getElementById('p-seek')!
      act(() => {
        fireEvent.pointerDown(seekBar, { clientX: clientXFor(5, 20), pointerId: 1 })
        fireEvent.pointerMove(seekBar, { clientX: clientXFor(8, 20), pointerId: 1 })
        fireEvent.pointerMove(seekBar, { clientX: clientXFor(11, 20), pointerId: 1 })
        fireEvent.pointerMove(seekBar, { clientX: clientXFor(14, 20), pointerId: 1 })
      })
      expect(currentTimeSets).toBe(0) // nada aplicado ainda — só no próximo frame

      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })

      expect(currentTimeSets).toBe(1) // só UM seek de fato aplicado no <video>
      expect(currentTimeValue).toBe(14) // com a posição mais recente, não a 1ª
    } finally {
      restoreBar()
    }
  })

  it('arraste da barra de progresso espera o <video> sair de "seeking" antes de aplicar o próximo — não força um novo seek enquanto o decoder ainda está resolvendo o anterior (ritmo ditado pelo decoder, não por um intervalo fixo)', async () => {
    const restoreBar = mockSeekBar()
    try {
      render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} />)
      await waitFor(() => {
        expect(document.getElementById('p-video')).not.toBeNull()
      })
      const a = document.getElementById('p-video') as HTMLVideoElement
      act(() => {
        fireLoadedMetadata(a, 20)
      })
      let currentTimeSets = 0
      let currentTimeValue = 0
      let seekingValue = false
      Object.defineProperty(a, 'currentTime', {
        configurable: true,
        get: () => currentTimeValue,
        set: (v: number) => {
          currentTimeValue = v
          currentTimeSets += 1
        },
      })
      Object.defineProperty(a, 'seeking', {
        configurable: true,
        get: () => seekingValue,
      })

      const seekBar = document.getElementById('p-seek')!
      // 1º seek aplica no próximo frame (nada em andamento ainda).
      act(() => {
        fireEvent.pointerDown(seekBar, { clientX: clientXFor(5, 20), pointerId: 1 })
      })
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
      expect(currentTimeSets).toBe(1)
      expect(currentTimeValue).toBe(5)

      // Decoder "ainda resolvendo" o seek anterior (simula um seek backward custoso, ex.:
      // keyframe distante) — o arraste continua, mas não deve forçar outro currentTime.
      seekingValue = true
      act(() => {
        fireEvent.pointerMove(seekBar, { clientX: clientXFor(2, 20), pointerId: 1 }) // arraste indo pra trás
      })
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
      expect(currentTimeSets).toBe(1) // nenhum novo seek aplicado — ainda "seeking"

      act(() => {
        fireEvent.pointerMove(seekBar, { clientX: clientXFor(1, 20), pointerId: 1 }) // mais uma posição chega
      })
      seekingValue = false // decoder finalmente resolveu o seek anterior
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
      expect(currentTimeSets).toBe(2) // aplica agora, com a posição mais recente
      expect(currentTimeValue).toBe(1)
    } finally {
      restoreBar()
    }
  })
})
