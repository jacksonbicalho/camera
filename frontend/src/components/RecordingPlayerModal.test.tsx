import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

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

// RecordingPlayerModal usa useNavigate (botão "Visualizar no histórico", ver CA5 abaixo) —
// precisa de contexto de Router mesmo nos testes que não exercitam esse botão.
describe('CA3: RecordingPlayerModal — reproduz uma gravação em modal, sem sair da página', () => {
  it('open=false não renderiza nada', () => {
    render(
      <MemoryRouter>
        <RecordingPlayerModal open={false} cameraId="cam1" recordingId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(document.getElementById('recording-player-modal')).toBeNull()
  })

  it('open=true renderiza o player com os segmentos resolvidos (via useRecordingSegments)', async () => {
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal')).not.toBeNull()
      expect(document.getElementById('recording-player-video')).not.toBeNull()
    })
  })

  it('clicar no botão de fechar chama onClose', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={onClose} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal-close')).not.toBeNull()
    })
    fireEvent.click(document.getElementById('recording-player-modal-close')!)
    expect(onClose).toHaveBeenCalled()
  })

  it('clicar no backdrop (fora do conteúdo) chama onClose', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={onClose} />
      </MemoryRouter>,
    )
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
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={onClose} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal')).not.toBeNull()
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('gravação não encontrada → mostra o banner de erro dentro do modal', async () => {
    g.getRecording.mockResolvedValue(null)
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={999} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal-error')?.textContent).toContain(
        'não encontrada',
      )
    })
  })
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe" data-pathname={location.pathname} />
}

describe('CA5: botão "Visualizar no histórico" navega pra /history/:cameraId/:recordingId(/:motionId)', () => {
  it('sem motionId, navega pra /history/{cameraId}/{recordingId} e fecha o modal', async () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <LocationProbe />
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={onClose} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-view-in-history')).not.toBeNull()
    })
    fireEvent.click(document.getElementById('recording-player-view-in-history')!)
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="location-probe"]')?.getAttribute('data-pathname'),
      ).toBe('/history/cam1/1')
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('com motionId, navega pra /history/{cameraId}/{recordingId}/{motionId}', async () => {
    render(
      <MemoryRouter>
        <LocationProbe />
        <RecordingPlayerModal
          open
          cameraId="cam1"
          recordingId={1}
          motionId={42}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-view-in-history')).not.toBeNull()
    })
    fireEvent.click(document.getElementById('recording-player-view-in-history')!)
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="location-probe"]')?.getAttribute('data-pathname'),
      ).toBe('/history/cam1/1/42')
    })
  })
})

describe('CA2: modal arrastável e redimensionável, mantendo a proporção do vídeo', () => {
  it('a caixa do modal é posicionada via style (position fixed + top/left/width/height vindos de useDraggableResizable) — não mais só centralizada por flex do backdrop', async () => {
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal-box')).not.toBeNull()
    })
    const box = document.getElementById('recording-player-modal-box')!
    expect(box.style.position).toBe('fixed')
    expect(box.style.width).not.toBe('')
    expect(box.style.height).not.toBe('')
  })

  it('tem uma alça de redimensionar no canto e um cabeçalho identificável como alça de arrastar', async () => {
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal-resize-handle')).not.toBeNull()
    })
    expect(document.getElementById('recording-player-modal-header')).not.toBeNull()
  })

  it('arrastar o cabeçalho move a caixa (top/left mudam pela distância percorrida)', async () => {
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal-header')).not.toBeNull()
    })
    const box = document.getElementById('recording-player-modal-box')!
    const header = document.getElementById('recording-player-modal-header')!
    const leftBefore = box.style.left
    fireEvent.pointerDown(header, { clientX: 500, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(header, { clientX: 560, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(header, { clientX: 560, clientY: 140, pointerId: 1 })
    expect(box.style.left).not.toBe(leftBefore)
  })

  it('arrastar a alça de redimensionar muda a largura E a altura, sempre na proporção aspect-video (16:9)', async () => {
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal-resize-handle')).not.toBeNull()
    })
    const box = document.getElementById('recording-player-modal-box')!
    const handle = document.getElementById('recording-player-modal-resize-handle')!
    const widthBefore = parseFloat(box.style.width)
    const heightBefore = parseFloat(box.style.height)
    // Delta pequeno (não 100+) — a caixa nasce com MODAL_INITIAL_WIDTH=896px, e o teto
    // default de useDraggableResizable (sem maxWidth explícito) é a largura da viewport
    // menos margem; num viewport de teste ~1024px isso deixaria pouca folga pra um delta
    // maior sem esbarrar no clamp, o que não é o que este teste quer exercitar.
    fireEvent.pointerDown(handle, { clientX: widthBefore, clientY: heightBefore, pointerId: 1 })
    fireEvent.pointerMove(handle, {
      clientX: widthBefore + 30,
      clientY: heightBefore,
      pointerId: 1,
    })
    fireEvent.pointerUp(handle, { clientX: widthBefore + 30, clientY: heightBefore, pointerId: 1 })
    const widthAfter = parseFloat(box.style.width)
    const heightAfter = parseFloat(box.style.height)
    expect(widthAfter).toBe(widthBefore + 30)
    expect(heightAfter).toBeGreaterThan(heightBefore)
    // A diferença de altura corresponde exatamente à diferença de largura dividida por 16/9
    // (o "chrome" de cabeçalho+rodapé é uma altura FIXA somada por cima — não muda com o
    // resize, só a área do vídeo em si escala mantendo a proporção).
    expect(heightAfter - heightBefore).toBeCloseTo((widthAfter - widthBefore) / (16 / 9))
  })
})

describe('CA7: botão "Visualizar no histórico" usa a cor de destaque (accent) do app', () => {
  it('tem border/text na cor primary — não mais outline neutro', async () => {
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-view-in-history')).not.toBeNull()
    })
    const className = document.getElementById('recording-player-view-in-history')!.className
    expect(className).toContain('text-primary')
    expect(className).toContain('border-primary')
    // REGRESSÃO: `variant="outline"` do Button já traz `hover:text-accent-foreground` —
    // sem sobrescrever explicitamente com `hover:text-primary`, o texto TROCA pra uma cor
    // neutra exatamente ao passar o mouse (o oposto de "intensificar" que
    // `hover:border-primary`/`hover:bg-primary/10` já sugerem), achado real do code review.
    expect(className).toContain('hover:text-primary')
  })
})

describe('CA8: botão de fechar usa o padrão de botão-ícone redondo (com área de clique e hover)', () => {
  it('mesma classe dos outros controles do player (h-8 w-8 rounded-full) e ícone X, não mais o caractere ✕ cru', async () => {
    render(
      <MemoryRouter>
        <RecordingPlayerModal open cameraId="cam1" recordingId={1} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal-close')).not.toBeNull()
    })
    const closeButton = document.getElementById('recording-player-modal-close')!
    expect(closeButton.className).toContain('rounded-full')
    expect(closeButton.className).toContain('h-8')
    expect(closeButton.className).toContain('w-8')
    expect(closeButton.textContent?.trim()).toBe('')
    expect(closeButton.querySelector('svg')).not.toBeNull()
    // REGRESSÃO: a caixa do modal (#recording-player-modal-box) já usa `bg-surface-2` como
    // fundo, herdado pelo cabeçalho — um hover `hover:bg-surface-2` no botão produziria a
    // MESMA cor do fundo em que ele já está (zero feedback visual, achado real do code
    // review). Precisa de um overlay que contraste com qualquer fundo (`bg-foreground/10`),
    // não um token de superfície sólido específico.
    expect(closeButton.className).not.toContain('hover:bg-surface-2')
    expect(closeButton.className).toContain('hover:bg-foreground/10')
  })
})
