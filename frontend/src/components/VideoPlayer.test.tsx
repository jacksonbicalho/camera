import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import VideoPlayer, { type VideoPlayerSegment } from './VideoPlayer'

afterEach(() => {
  cleanup()
})

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

  it('zoom=false: não renderiza o chip de reset de zoom', async () => {
    render(<VideoPlayer idPrefix="p" segments={[seg('a.mp4', 0, Infinity)]} zoom={false} />)
    await waitFor(() => {
      expect(document.getElementById('p-video')).not.toBeNull()
    })
    expect(document.getElementById('p-zoom-reset')).toBeNull()
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
})
