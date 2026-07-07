import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

// RecordingsGateway captura globalThis.fetch no construtor e a instância nasce no nível do
// módulo do HistoryPage — stubar fetch não a alcança (mesma razão documentada em
// VideoBrowserPage.test.tsx). Mocka só getRecording, controlável por teste.
const gateway = vi.hoisted(() => ({ getRecording: vi.fn() }))

vi.mock('../lib/recordingsGateway', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/recordingsGateway')>()
  return {
    ...actual,
    RecordingsGateway: class {
      getRecording = gateway.getRecording
    },
  }
})

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getToken: () => 'tok',
  getRole: () => 'admin',
  getUsername: () => 'jackson',
  clearToken: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

vi.mock('../components/DatePicker', () => ({
  default: ({ value, onChange, availableDays }: { value: Date; onChange: (d: Date) => void; availableDays?: string[] }) => (
    <div
      data-testid="history-datepicker"
      data-value={value.toISOString().slice(0, 10)}
      data-available={JSON.stringify(availableDays)}
    >
      <button onClick={() => onChange(new Date('2026-07-04T12:00:00Z'))}>escolher 04/07</button>
    </div>
  ),
}))

import HistoryPage from './HistoryPage'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe" data-pathname={location.pathname} />
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routes>
        <Route path="/history/:cameraId" element={<HistoryPage />} />
        <Route path="/history/:cameraId/:recordingId" element={<HistoryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function currentPathname(): string {
  return document.querySelector('[data-testid="location-probe"]')!.getAttribute('data-pathname')!
}

const cameras = [{ id: 'cam1', name: 'Corredor de entrada', recording_enabled: true }]
// Ordem DECRESCENTE (mais recente primeiro) — o stub abaixo não ordena de verdade (só filtra
// por data), então a ordem que a API "devolveria" pra `order=desc` precisa já vir assim na
// fixture, senão os testes não refletem o que um backend real mandaria.
const recordings = [
  { id: 2, filename: 'b.mp4', start: '2026-07-05T08:03:00Z', end: '2026-07-05T08:04:10Z', url: '/recordings/cam1/b.mp4', is_recording: false, has_motion: false },
  { id: 1, filename: 'a.mp4', start: '2026-07-05T07:12:00Z', end: '2026-07-05T07:12:42Z', url: '/recordings/cam1/a.mp4', is_recording: false, has_motion: false },
]
const recordingsJul4 = [
  { id: 3, filename: 'c.mp4', start: '2026-07-04T10:00:00Z', end: '2026-07-04T10:01:00Z', url: '/recordings/cam1/c.mp4', is_recording: false, has_motion: false },
]

// O mock do DatePicker só troca pra "04/07" (2026-07-04) — qualquer outra data
// (inclusive a padrão, "hoje" de verdade no momento do teste) devolve
// `defaultDayRecordings`. Permite testar a troca de dia sem depender da data real.
function stubFetch(defaultDayRecordings: typeof recordings = recordings) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/cameras/') && url.includes('/content-days')) {
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ days: ['2026-07-04', '2026-07-05'] }) })
      }
      if (url.startsWith('/api/cameras/') && url.includes('/recordings')) {
        const date = new URL(url, 'http://x').searchParams.get('date') ?? ''
        const recs = date === '2026-07-04' ? recordingsJul4 : defaultDayRecordings
        return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings: recs, hasMore: false, total: recs.length }) })
      }
      if (url.startsWith('/api/cameras/') && url.includes('/motion')) {
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ events: [] }) })
      }
      if (url.startsWith('/api/cameras')) {
        return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
      }
      return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
    }),
  )
}

beforeEach(() => {
  stubFetch()
  gateway.getRecording.mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('HistoryPage', () => {
  it('header com nome da câmera, badge GRAVANDO (sem AO VIVO) e tabs (Ao vivo → /live)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-header')?.textContent).toContain('Corredor de entrada')
    })
    expect(document.getElementById('history-badge-recording')).not.toBeNull()
    expect(document.getElementById('history-badge-live')).toBeNull()
    expect(document.getElementById('camera-tab-history')?.getAttribute('aria-current')).toBe('page')
    expect(document.getElementById('camera-tab-live')?.getAttribute('href')).toBe('/live/cam1')
  })

  it('conteúdo usa a largura padrão compartilhada (.page-content — mesma largura de Ao vivo/Reprodução)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-content')).not.toBeNull()
    })
    expect(document.getElementById('history-content')?.className).toContain('page-content')
    expect(document.getElementById('history-content')?.className).not.toContain('max-w-5xl')
  })

  it('toca a gravação mais recente do dia por padrão e lista as demais no filmstrip', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-2')).not.toBeNull()
    })
    expect(document.getElementById('history-recording-2')?.getAttribute('aria-current')).toBe('true')
    const video = document.getElementById('history-player-video') as HTMLVideoElement
    expect(video.getAttribute('src')).toBe('/recordings/cam1/b.mp4?token=tok')
    expect(document.getElementById('history-recordings')?.textContent).toContain('Gravações · 2')
  })

  it('rola o filmstrip até o card ativo (scrollIntoView) — essencial ao abrir a URL compartilhável de uma gravação distante na lista', async () => {
    const scrollIntoView = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ inline: 'center', block: 'nearest' }),
      )
      scrollIntoView.mockClear()
      document.getElementById('history-recording-1')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalled()
      })
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('filmstrip lista da mais recente pra mais antiga (esquerda pra direita)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-2')).not.toBeNull()
    })
    const older = document.getElementById('history-recording-1')!
    const newer = document.getElementById('history-recording-2')!
    // DOCUMENT_POSITION_FOLLOWING (4): `newer` vem DEPOIS de `older` no argumento — ou seja,
    // `older` precisa aparecer ANTES de `newer` no DOM pra esse bit não estar setado. Aqui
    // queremos o oposto: `newer` (b.mp4, mais recente) primeiro no DOM.
    expect(newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('bloco de gravações tem borda suave; a lista (scroll horizontal) usa scrollbar fino', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recordings')).not.toBeNull()
    })
    expect(document.getElementById('history-recordings')?.className).toContain('border-border')
    expect(document.getElementById('history-recordings')?.className).toContain('rounded-lg')
    const list = document.getElementById('history-recordings-list')
    expect(list?.className).toContain('[&::-webkit-scrollbar]:h-1')
    expect(list?.className).toContain('[&::-webkit-scrollbar-thumb]:rounded-full')
  })

  it('card ativo usa a cor de destaque como fundo (bg-primary/15 + border-primary) e pisca enquanto o vídeo toca', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-2')).not.toBeNull()
    })
    const active = document.getElementById('history-recording-2')!
    expect(active.className).toContain('bg-primary/15')
    expect(active.className).toContain('border-primary')
    expect(active.getAttribute('style')).toContain('filmstrip-blink')

    const inactive = document.getElementById('history-recording-1')!
    expect(inactive.className).toContain('bg-surface-2')
    expect(inactive.className).not.toContain('bg-primary/15')
    expect(inactive.getAttribute('style') ?? '').not.toContain('filmstrip-blink')
  })

  it('pausar o vídeo para o pisca do card ativo (só pisca tocando de verdade, não só selecionado)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-2')).not.toBeNull()
    })
    const video = document.getElementById('history-player-video') as HTMLVideoElement
    video.dispatchEvent(new Event('pause'))
    await waitFor(() => {
      expect(document.getElementById('history-recording-2')?.getAttribute('style') ?? '').not.toContain('filmstrip-blink')
    })
  })

  it('duração exibida no card continua correta com o filmstrip invertido (usa o próximo cronológico, não o índice invertido)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-1')).not.toBeNull()
    })
    // a.mp4: start 07:12:00, end 07:12:42 → 0:42 (usa `end`, não depende de ordem)
    expect(document.getElementById('history-recording-1')?.textContent).toContain('0:42')
  })

  it('card mostra a hora em formato 24h com segundos (HH:MM:SS, sem AM/PM)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-1')).not.toBeNull()
    })
    // Sem \b: o textContent concatena a duração ("0:42") direto com a hora ("07:12:00"),
    // sem espaço entre os dígitos — não há fronteira de palavra entre "2" e "0".
    const text = document.getElementById('history-recording-1')?.textContent ?? ''
    expect(text).toMatch(/([01]\d|2[0-3]):[0-5]\d:[0-5]\d/)
    expect(text).not.toMatch(/AM|PM/i)
  })

  it('gravação em andamento (is_recording) não aparece no filmstrip nem no contador', async () => {
    stubFetch([
      ...recordings,
      { id: 4, filename: 'd.mp4', start: '2026-07-05T09:00:00Z', url: '/recordings/cam1/d.mp4', is_recording: true, has_motion: false },
    ])
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-1')).not.toBeNull()
    })
    expect(document.getElementById('history-recording-4')).toBeNull()
    expect(document.getElementById('history-recordings')?.textContent).toContain('Gravações · 2')
  })

  it('player de histórico ganha zoom (PlayerControlsOverlay) mas sem botão de tela cheia próprio — só o nativo do <video controls>', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-player-video')).not.toBeNull()
    })
    expect(document.getElementById('history-player-video')?.hasAttribute('controls')).toBe(true)
    expect(document.getElementById('history-player-video-fullscreen')).toBeNull()
    expect(document.getElementById('history-player-video-zoom-reset')).toBeNull()
  })

  it('clicar num card do filmstrip troca a gravação em reprodução', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-1')).not.toBeNull()
    })
    document.getElementById('history-recording-1')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      const video = document.getElementById('history-player-video') as HTMLVideoElement
      expect(video.getAttribute('src')).toBe('/recordings/cam1/a.mp4?token=tok')
    })
    expect(document.getElementById('history-recording-1')?.getAttribute('aria-current')).toBe('true')
    expect(document.getElementById('history-recording-2')?.getAttribute('aria-current')).toBeNull()
  })

  it('sem gravações no dia → sem player nem filmstrip, mas calendário continua visível', async () => {
    stubFetch([])
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-header')?.textContent).toContain('Corredor de entrada')
    })
    expect(document.getElementById('history-recordings')).not.toBeNull()
    expect(document.getElementById('history-recordings-list')).toBeNull()
    expect(document.getElementById('history-recordings')?.textContent).toContain('Gravações')
    expect(document.getElementById('history-recordings')?.textContent).not.toContain('Gravações ·')
    expect(document.querySelector('#history-player video')).toBeNull()
    expect(document.getElementById('history-player')?.textContent).toContain('Sem gravações nesse dia')
  })

  it('mostra o calendário, buscando os dias com conteúdo (content-days)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.querySelector('[data-testid="history-datepicker"]')).not.toBeNull()
    })
    const picker = document.querySelector('[data-testid="history-datepicker"]')!
    expect(picker.getAttribute('data-available')).toBe(JSON.stringify(['2026-07-04', '2026-07-05']))
  })

  it('trocar a data no calendário recarrega gravações/eventos daquele dia e reseleciona', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-1')).not.toBeNull()
    })
    document.querySelector('[data-testid="history-datepicker"] button')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    )
    await waitFor(() => {
      expect(document.getElementById('history-recording-3')).not.toBeNull()
    })
    expect(document.getElementById('history-recording-1')).toBeNull()
    expect(document.getElementById('history-recording-3')?.getAttribute('aria-current')).toBe('true')
    const video = document.getElementById('history-player-video') as HTMLVideoElement
    expect(video.getAttribute('src')).toBe('/recordings/cam1/c.mp4?token=tok')
  })

  it('mostra loading até o vídeo carregar e volta a mostrar ao trocar de gravação', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-player-video')).not.toBeNull()
    })
    expect(document.getElementById('history-player-loading')).not.toBeNull()

    const video = document.getElementById('history-player-video') as HTMLVideoElement
    video.dispatchEvent(new Event('loadeddata'))
    await waitFor(() => {
      expect(document.getElementById('history-player-loading')).toBeNull()
    })

    document.getElementById('history-recording-1')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('history-player-loading')).not.toBeNull()
    })
  })

  it('erro ao carregar o vídeo mostra mensagem e para o loading (em vez de girar pra sempre)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-player-video')).not.toBeNull()
    })
    const video = document.getElementById('history-player-video') as HTMLVideoElement
    video.dispatchEvent(new Event('error'))
    await waitFor(() => {
      expect(document.getElementById('history-player-error')).not.toBeNull()
    })
    expect(document.getElementById('history-player-loading')).toBeNull()
  })

  it('erro de uma gravação some ao trocar pra outra (não gruda no card seguinte)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-player-video')).not.toBeNull()
    })
    const video = document.getElementById('history-player-video') as HTMLVideoElement
    video.dispatchEvent(new Event('error'))
    await waitFor(() => {
      expect(document.getElementById('history-player-error')).not.toBeNull()
    })
    document.getElementById('history-recording-1')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('history-player-error')).toBeNull()
    })
  })

  it('clicar no card já ativo não trava o loading (o <video> não remonta, "loadeddata" não dispara de novo)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-player-video')).not.toBeNull()
    })
    const video = document.getElementById('history-player-video') as HTMLVideoElement
    video.dispatchEvent(new Event('loadeddata'))
    await waitFor(() => {
      expect(document.getElementById('history-player-loading')).toBeNull()
    })

    document.getElementById('history-recording-2')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.getElementById('history-player-loading')).toBeNull()
  })

  it('lista de gravações atualiza sozinha via poll (sem precisar recarregar a página)', async () => {
    // `waitFor` não avança sob fake timers (trava o teste e vaza os fake timers pros
    // testes seguintes) — flush do carregamento inicial e do poll via
    // `advanceTimersByTimeAsync`, sem `waitFor`, o tempo todo sob fake timers.
    vi.useFakeTimers()
    try {
      renderAt('/history/cam1')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(document.getElementById('history-recording-1')).not.toBeNull()
      expect(document.getElementById('history-recordings')?.textContent).toContain('Gravações · 2')

      stubFetch([
        ...recordings,
        { id: 5, filename: 'e.mp4', start: '2026-07-05T10:00:00Z', end: '2026-07-05T10:01:00Z', url: '/recordings/cam1/e.mp4', is_recording: false, has_motion: false },
      ])
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(document.getElementById('history-recording-5')).not.toBeNull()
      expect(document.getElementById('history-recordings')?.textContent).toContain('Gravações · 3')
    } finally {
      vi.useRealTimers()
    }
  })

  it('câmera inexistente → bloco de erro #history-error', async () => {
    renderAt('/history/desconhecida')
    const err = await waitFor(() => {
      const el = document.getElementById('history-error')
      if (!el) throw new Error('erro não renderizou')
      return el
    })
    expect(err.textContent).toContain('não encontrada')
  })

  it('abrir /history/:cameraId/:recordingId carrega o dia certo (não hoje) e seleciona a gravação', async () => {
    gateway.getRecording.mockResolvedValue({ filename: 'c.mp4', date: '2026-07-04' })
    renderAt('/history/cam1/3')
    await waitFor(() => {
      expect(document.getElementById('history-recording-3')).not.toBeNull()
    })
    expect(document.getElementById('history-recording-3')?.getAttribute('aria-current')).toBe('true')
    const video = document.getElementById('history-player-video') as HTMLVideoElement
    expect(video.getAttribute('src')).toBe('/recordings/cam1/c.mp4?token=tok')
    expect(document.querySelector('[data-testid="history-datepicker"]')?.getAttribute('data-value')).toBe('2026-07-04')
  })

  it('recordingId inexistente na URL → overlay centralizado no player (tela preta) some sozinho depois de um tempo, sem depender de qual carregamento (câmera/gravações) termina primeiro', async () => {
    gateway.getRecording.mockResolvedValue(null)
    vi.useFakeTimers()
    try {
      renderAt('/history/cam1/999')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      const overlay = document.getElementById('history-recording-not-found')
      expect(overlay).not.toBeNull()
      expect(overlay?.textContent).toContain('não encontrada')
      expect(overlay?.className).toContain('bg-black')
      // Não é mais um banner no topo da página.
      expect(document.getElementById('history-error')).toBeNull()
      // O overlay é aditivo (por cima), não substitui o conteúdo — o dia de fallback (hoje) já
      // carregou uma gravação válida por baixo dele, independente da ordem de resolução dos
      // fetches (câmera vs. gravações), que num servidor real não é determinística.
      expect(document.getElementById('history-recording-2')).not.toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(document.getElementById('history-recording-not-found')).toBeNull()
      expect(document.getElementById('history-recording-2')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('selecionar gravação (padrão ou clique) mantém a URL sincronizada e compartilhável', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-2')).not.toBeNull()
    })
    await waitFor(() => {
      expect(currentPathname()).toBe('/history/cam1/2')
    })

    document.getElementById('history-recording-1')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(currentPathname()).toBe('/history/cam1/1')
    })
  })

  it('"Carregar mais" só aparece com hasMore e concatena a próxima página ao clicar', async () => {
    const page1 = [
      { id: 10, filename: 'p1a.mp4', start: '2026-07-05T09:00:00Z', end: '2026-07-05T09:05:00Z', url: '/recordings/cam1/p1a.mp4', is_recording: false, has_motion: false },
    ]
    const page2 = [
      { id: 11, filename: 'p2a.mp4', start: '2026-07-05T08:00:00Z', end: '2026-07-05T08:05:00Z', url: '/recordings/cam1/p2a.mp4', is_recording: false, has_motion: false },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/content-days')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ days: ['2026-07-05'] }) })
        }
        if (url.includes('/recordings')) {
          const page = new URL(url, 'http://x').searchParams.get('page')
          const recs = page === '2' ? page2 : page1
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings: recs, hasMore: page !== '2', total: 2 }) })
        }
        if (url.includes('/motion')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ events: [] }) })
        }
        if (url.startsWith('/api/cameras')) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
        }
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-10')).not.toBeNull()
    })
    expect(document.getElementById('history-recording-11')).toBeNull()
    const loadMoreBtn = document.getElementById('history-load-more')!
    expect(loadMoreBtn).not.toBeNull()
    loadMoreBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      expect(document.getElementById('history-recording-11')).not.toBeNull()
    })
    // page 2 respondeu hasMore:false → o botão some.
    expect(document.getElementById('history-load-more')).toBeNull()
  })

  it('poll mescla só a página recente, sem perder páginas antigas já carregadas via "Carregar mais"', async () => {
    let pollCount = 0
    // `mergeRecordings` (usado no poll) ordena por `filename` — nomes precisam ser
    // cronologicamente ordenáveis (mesmo formato timestamp que o backend real usa), senão a
    // lógica de "janela mais recente" da função não bate com o `start` dos fixtures.
    const oldPage = [
      { id: 20, filename: '20260705060000.mp4', start: '2026-07-05T06:00:00Z', end: '2026-07-05T06:05:00Z', url: '/recordings/cam1/old.mp4', is_recording: false, has_motion: false },
    ]
    function recentPage() {
      const base = [
        { id: 21, filename: '20260705090000.mp4', start: '2026-07-05T09:00:00Z', end: '2026-07-05T09:05:00Z', url: '/recordings/cam1/recent.mp4', is_recording: false, has_motion: false },
      ]
      if (pollCount > 0) {
        base.unshift({ id: 22, filename: '20260705091000.mp4', start: '2026-07-05T09:10:00Z', end: '2026-07-05T09:15:00Z', url: '/recordings/cam1/newer.mp4', is_recording: false, has_motion: false })
      }
      return base
    }
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/content-days')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ days: ['2026-07-05'] }) })
        }
        if (url.includes('/recordings')) {
          const page = new URL(url, 'http://x').searchParams.get('page')
          if (page === '2') return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings: oldPage, hasMore: false, total: 2 }) })
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings: recentPage(), hasMore: true, total: 2 }) })
        }
        if (url.includes('/motion')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ events: [] }) })
        }
        if (url.startsWith('/api/cameras')) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
        }
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    vi.useFakeTimers()
    try {
      renderAt('/history/cam1')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      document.getElementById('history-load-more')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(document.getElementById('history-recording-20')).not.toBeNull() // página antiga carregada

      pollCount = 1
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(document.getElementById('history-recording-22')).not.toBeNull() // nova, veio no poll
      expect(document.getElementById('history-recording-20')).not.toBeNull() // antiga sobrevive ao poll
    } finally {
      vi.useRealTimers()
    }
  })

  it('contador usa o total real do dia (campo `total` da API), não a quantidade renderizada em tela', async () => {
    // Só a página 1 (1 gravação) está carregada/renderizada no filmstrip, mas o dia tem 23
    // gravações no total (`total` do backend, que conta o filesystem inteiro, não a página
    // atual) — o contador precisa refletir o total real, não `recordings.length` (que mostraria
    // "1"). Reproduz o relato: contador não pode divergir entre "o que já foi acumulado em tela
    // via poll" e "o que uma recarga da página mostraria".
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/content-days')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ days: ['2026-07-05'] }) })
        }
        if (url.includes('/recordings')) {
          return Promise.resolve({
            status: 200,
            json: () => Promise.resolve({
              recordings: [{ id: 50, filename: 's1.mp4', start: '2026-07-05T09:00:00Z', end: '2026-07-05T09:05:00Z', url: '/recordings/cam1/s1.mp4', is_recording: false, has_motion: false }],
              hasMore: true,
              total: 23,
            }),
          })
        }
        if (url.includes('/motion')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ events: [] }) })
        }
        if (url.startsWith('/api/cameras')) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
        }
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-50')).not.toBeNull()
    })
    expect(document.getElementById('history-recordings')?.textContent).toContain('Gravações · 23')
    expect(document.getElementById('history-recordings')?.textContent).not.toContain('Gravações · 1')
  })

  it('gravação selecionada apagada pelo cleaner (via poll) → troca pra outra ainda existente, sem cair em "Sem gravações nesse dia"', async () => {
    const initial = [
      { id: 60, filename: 'sel-a.mp4', start: '2026-07-05T09:00:00Z', end: '2026-07-05T09:05:00Z', url: '/recordings/cam1/sel-a.mp4', is_recording: false, has_motion: false },
      { id: 61, filename: 'sel-b.mp4', start: '2026-07-05T08:00:00Z', end: '2026-07-05T08:05:00Z', url: '/recordings/cam1/sel-b.mp4', is_recording: false, has_motion: false },
    ]
    // id 60 (a selecionada por padrão — mais recente) sumiu: o cleaner apagou o arquivo.
    const afterCleanup = [initial[1]]
    let polled = false
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/content-days')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ days: ['2026-07-05'] }) })
        }
        if (url.includes('/recordings')) {
          const recs = polled ? afterCleanup : initial
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings: recs, hasMore: false, total: recs.length }) })
        }
        if (url.includes('/motion')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ events: [] }) })
        }
        if (url.startsWith('/api/cameras')) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
        }
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    vi.useFakeTimers()
    try {
      renderAt('/history/cam1')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(document.getElementById('history-recording-60')?.getAttribute('aria-current')).toBe('true')

      polled = true
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(document.getElementById('history-recording-60')).toBeNull()
      expect(document.getElementById('history-recording-61')?.getAttribute('aria-current')).toBe('true')
      const video = document.getElementById('history-player-video') as HTMLVideoElement
      expect(video?.getAttribute('src')).toBe('/recordings/cam1/sel-b.mp4?token=tok')
      expect(document.querySelector('#history-player')?.textContent).not.toContain('Sem gravações nesse dia')
    } finally {
      vi.useRealTimers()
    }
  })

  it('poll usa a janela completa já carregada (não só a página 1) — gravação deletada pelo cleaner some da lista e do contador', async () => {
    const page1 = [
      { id: 40, filename: 'r1.mp4', start: '2026-07-05T09:00:00Z', end: '2026-07-05T09:05:00Z', url: '/recordings/cam1/r1.mp4', is_recording: false, has_motion: false },
    ]
    const page2 = [
      { id: 41, filename: 'r2.mp4', start: '2026-07-05T08:00:00Z', end: '2026-07-05T08:05:00Z', url: '/recordings/cam1/r2.mp4', is_recording: false, has_motion: false },
    ]
    // Depois do cleaner apagar r2.mp4, o próximo poll (que precisa cobrir as 2 páginas já
    // carregadas numa só chamada, não só a página 1) só devolve o que ainda existe.
    const afterCleanup = [page1[0]]
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/content-days')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ days: ['2026-07-05'] }) })
        }
        if (url.includes('/recordings')) {
          const params = new URL(url, 'http://x').searchParams
          const page = params.get('page')
          const limit = params.get('limit')
          if (page === '2') return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings: page2, hasMore: true, total: 2 }) })
          // Poll depois do "Carregar mais": pede a janela inteira já carregada (page*PAGE_SIZE)
          // numa chamada só — é aqui que a remoção do cleaner precisa aparecer. `total` (contagem
          // real do dia, vinda do filesystem no backend) já cai pra 1 nessa resposta.
          if (limit === '40') return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings: afterCleanup, hasMore: true, total: 1 }) })
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings: page1, hasMore: true, total: 2 }) })
        }
        if (url.includes('/motion')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ events: [] }) })
        }
        if (url.startsWith('/api/cameras')) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
        }
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    vi.useFakeTimers()
    try {
      renderAt('/history/cam1')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      document.getElementById('history-load-more')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(document.getElementById('history-recording-41')).not.toBeNull()
      expect(document.getElementById('history-recordings')?.textContent).toContain('Gravações · 2')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })
      expect(document.getElementById('history-recording-41')).toBeNull() // apagada pelo cleaner, some da lista
      expect(document.getElementById('history-recording-40')).not.toBeNull()
      expect(document.getElementById('history-recordings')?.textContent).toContain('Gravações · 1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('URL compartilhável de uma gravação fora da 1ª página pagina sozinho até achar', async () => {
    const page1 = [
      { id: 30, filename: 'q1.mp4', start: '2026-07-05T09:00:00Z', end: '2026-07-05T09:05:00Z', url: '/recordings/cam1/q1.mp4', is_recording: false, has_motion: false },
    ]
    const page2 = [
      { id: 31, filename: 'q2.mp4', start: '2026-07-05T06:00:00Z', end: '2026-07-05T06:05:00Z', url: '/recordings/cam1/q2.mp4', is_recording: false, has_motion: false },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/content-days')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ days: ['2026-07-05'] }) })
        }
        if (url.includes('/recordings')) {
          const page = new URL(url, 'http://x').searchParams.get('page')
          const recs = page === '2' ? page2 : page1
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings: recs, hasMore: page !== '2', total: 2 }) })
        }
        if (url.includes('/motion')) {
          return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ events: [] }) })
        }
        if (url.startsWith('/api/cameras')) {
          return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
        }
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    gateway.getRecording.mockResolvedValue({ filename: 'q2.mp4', date: '2026-07-05' })
    renderAt('/history/cam1/31')
    await waitFor(() => {
      expect(document.getElementById('history-recording-31')).not.toBeNull()
    })
    expect(document.getElementById('history-recording-31')?.getAttribute('aria-current')).toBe('true')
    // A página 1 também veio junto (paginou por cima dela até achar a 31 na página 2).
    expect(document.getElementById('history-recording-30')).not.toBeNull()
  })
})
