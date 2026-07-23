import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

// RecordingsGateway captura globalThis.fetch no construtor e a instância nasce no nível do
// módulo do HistoryPage — stubar fetch não a alcança (mesma razão documentada em
// VideoBrowserPage.test.tsx). Mocka só getRecording, controlável por teste.
const gateway = vi.hoisted(() => ({ getRecording: vi.fn() }))

vi.mock('../lib/recordingsGateway', async (importOriginal) => {
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

vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markRead: vi.fn(),
    markSelectedRead: vi.fn(),
    remove: vi.fn(),
    removeAll: vi.fn(),
    removeSelected: vi.fn(),
    browserSupported: false,
    browserPermission: 'default',
    browserEnabled: false,
    enableBrowserNotifications: vi.fn(),
    disableBrowserNotifications: vi.fn(),
  }),
}))

vi.mock('../components/DatePicker', () => ({
  default: ({
    value,
    onChange,
    availableDays,
  }: {
    value: Date
    onChange: (d: Date) => void
    availableDays?: string[]
  }) => (
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
// Ordem DECRESCENTE (mais recente primeiro) — mesma ordem que `order=desc` devolveria.
const recordings = [
  {
    id: 2,
    filename: 'b.mp4',
    start: '2026-07-05T08:03:00Z',
    end: '2026-07-05T08:04:10Z',
    url: '/recordings/cam1/b.mp4',
    is_recording: false,
    has_motion: false,
  },
  {
    id: 1,
    filename: 'a.mp4',
    start: '2026-07-05T07:12:00Z',
    end: '2026-07-05T07:12:42Z',
    url: '/recordings/cam1/a.mp4',
    is_recording: false,
    has_motion: false,
  },
]
const recordingsJul4 = [
  {
    id: 3,
    filename: 'c.mp4',
    start: '2026-07-04T10:00:00Z',
    end: '2026-07-04T10:01:00Z',
    url: '/recordings/cam1/c.mp4',
    is_recording: false,
    has_motion: false,
  },
]

// O mock do DatePicker só troca pra "04/07" (2026-07-04) — qualquer outra data (inclusive a
// padrão, "hoje" de verdade no momento do teste) devolve `defaultDayRecordings`. `events` é
// opcional — a maioria dos testes não depende dele.
function stubFetch(
  defaultDayRecordings: typeof recordings = recordings,
  events: Array<{ time: string; label?: string; kind?: 'motion' | 'state' }> = [],
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/cameras/') && url.includes('/content-days')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ days: ['2026-07-04', '2026-07-05'] }),
        })
      }
      if (url.startsWith('/api/cameras/') && url.includes('/recordings')) {
        const date = new URL(url, 'http://x').searchParams.get('date') ?? ''
        const recs = date === '2026-07-04' ? recordingsJul4 : defaultDayRecordings
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ recordings: recs, hasMore: false, total: recs.length }),
        })
      }
      if (url.startsWith('/api/cameras/') && url.includes('/motion')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: () => Promise.resolve({ events }),
        })
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
  describe('Cabeçalho da página', () => {
    it('header com nome da câmera e badge GRAVANDO (sem AO VIVO, sem tabs — foram pro rodapé do player)', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-header')?.textContent).toContain(
          'Corredor de entrada',
        )
      })
      expect(document.getElementById('history-badge-recording')).not.toBeNull()
      expect(document.getElementById('history-badge-live')).toBeNull()
      expect(
        document
          .getElementById('history-header')
          ?.contains(document.getElementById('camera-view-tabs')),
      ).toBe(false)
    })

    describe('CA2: título fixo da página é "Histórico", independente da câmera', () => {
      it('título fixo da página é "Histórico", independente da câmera', async () => {
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.querySelector('#history-header h2')).not.toBeNull()
        })
        const title = document.querySelector('#history-header h2')!
        expect(title.textContent?.trim()).toBe('Histórico')
      })
    })

    describe('CA3: subtítulo da página mostra o nome da câmera (com o badge de gravação)', () => {
      it('subtítulo da página mostra o nome da câmera (com o badge de gravação)', async () => {
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-badge-recording')).not.toBeNull()
        })
        const header = document.getElementById('history-header')!
        const title = header.querySelector('h2')!
        // O nome da câmera não pode aparecer dentro do título (esse agora é fixo,
        // "Histórico") — só no subtítulo, junto do badge.
        expect(title.textContent).not.toContain('Corredor de entrada')
        expect(header.textContent).toContain('Corredor de entrada')
        const badge = document.getElementById('history-badge-recording')!
        expect(title.contains(badge)).toBe(false)
      })
    })

    describe('CA4: título alinha com a largura do conteúdo abaixo (mesmo cap/centralização das duas colunas)', () => {
      it('título alinha com a largura do conteúdo abaixo (mesmo cap/centralização das duas colunas)', async () => {
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-header')).not.toBeNull()
        })
        // Largura intrínseca de history-main (lg:max-w-[72rem]) + history-recordings-list
        // (lg:w-80 = 20rem) + gap-3 (0.75rem) da linha = 92.75rem — o wrapper do título
        // precisa do MESMO cap + mx-auto pra alinhar com o bloco de duas colunas em telas
        // largas (ver analysis/202607131109_history-page-title.md).
        const header = document.getElementById('history-header')!
        expect(header.className).toContain('mx-auto')
        expect(header.className).toContain('max-w-[92.75rem]')
      })
    })
  })

  describe('Abas e rodapé do player', () => {
    it('tabs Ao vivo/Histórico (Ao vivo → /live) ficam no rodapé do player, como último elemento (depois da tela cheia)', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-player-controls')).not.toBeNull()
      })
      expect(document.getElementById('camera-tab-history')?.getAttribute('aria-current')).toBe(
        'page',
      )
      expect(document.getElementById('camera-tab-live')?.getAttribute('href')).toBe('/live/cam1')
      const controls = document.getElementById('history-player-controls')!
      const fullscreen = document.getElementById('history-player-fullscreen')!
      const tabs = document.getElementById('camera-view-tabs')!
      expect(controls.contains(tabs)).toBe(true)
      const position = fullscreen.compareDocumentPosition(tabs)
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('botão de tela cheia fica entre a velocidade e o switch de reprodução contínua', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-player-fullscreen')).not.toBeNull()
      })
      const speed = document.getElementById('history-player-speed')!
      const fullscreen = document.getElementById('history-player-fullscreen')!
      const continuous = document.getElementById('history-continuous-toggle')!
      expect(
        speed.compareDocumentPosition(fullscreen) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(
        fullscreen.compareDocumentPosition(continuous) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })

  describe('Layout de duas colunas', () => {
    it('conteúdo usa layout de duas colunas (player à esquerda, lista à direita) — não mais .page-content; sidebar alinha com o topo do PLAYER, não do título', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
      expect(document.getElementById('history-content')?.className).not.toContain('page-content')
      // `history-content` não deve forçar altura de página inteira (flex-1) — isso faria o
      // VideoPlayer (que usa h-full internamente) estufar além do necessário.
      expect(document.getElementById('history-content')?.className).not.toContain('flex-1')
      const main = document.getElementById('history-main')!
      const sidebar = document.getElementById('history-recordings-list')!
      expect(main.className).toContain('flex-1')
      expect(sidebar.className).toContain('lg:w-80')
      // `history-main` e o sidebar são IRMÃOS numa linha própria (lg:flex-row) — o título
      // (history-header) NÃO é ancestral dela: fica acima, fora da linha.
      expect(main.parentElement).toBe(sidebar.parentElement)
      expect(main.parentElement?.className).toContain('lg:flex-row')
      const header = document.getElementById('history-header')!
      expect(main.parentElement?.contains(header)).toBe(false)
      // Dropdown de filtro mora no sidebar, junto da lista.
      expect(sidebar.contains(document.getElementById('history-filter-dropdown'))).toBe(true)
    })
  })

  describe('Lista lateral de gravações', () => {
    it('toca a gravação mais recente do dia por padrão e lista as demais na lista lateral', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
      expect(document.getElementById('history-recording-2')?.getAttribute('aria-current')).toBe(
        'true',
      )
      const video = document.getElementById('history-player-video') as HTMLVideoElement
      expect(video.getAttribute('src')).toBe('/recordings/cam1/b.mp4?token=tok')
      expect(document.getElementById('history-recording-1')).not.toBeNull()
    })

    it('rola a lista até o item ativo (scrollIntoView) — essencial ao abrir a URL compartilhável de uma gravação distante na lista', async () => {
      const scrollIntoView = vi.fn()
      const original = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = scrollIntoView
      try {
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })
        expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }))
        scrollIntoView.mockClear()
        document
          .getElementById('history-recording-1')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await waitFor(() => {
          expect(scrollIntoView).toHaveBeenCalled()
        })
      } finally {
        Element.prototype.scrollIntoView = original
      }
    })

    it('lista mostra da mais recente pra mais antiga (topo pra baixo)', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
      const older = document.getElementById('history-recording-1')!
      const newer = document.getElementById('history-recording-2')!
      expect(newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('a lista lateral tem borda suave e scroll vertical próprio', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
      const sidebar = document.getElementById('history-recordings-list')
      expect(sidebar?.className).toContain('border-border')
      expect(sidebar?.className).toContain('rounded-lg')
      const groups = document.getElementById('history-recordings-groups')
      expect(groups?.className).toContain('overflow-y-auto')
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
        expect(
          document.getElementById('history-recording-2')?.getAttribute('style') ?? '',
        ).not.toContain('filmstrip-blink')
      })
    })

    it('duração exibida no card usa o próximo cronológico (não o índice invertido da lista)', async () => {
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
      const text = document.getElementById('history-recording-1')?.textContent ?? ''
      expect(text).toMatch(/([01]\d|2[0-3]):[0-5]\d:[0-5]\d/)
      expect(text).not.toMatch(/AM|PM/i)
    })

    it('gravação em andamento (is_recording) não aparece na lista nem no contador', async () => {
      stubFetch([
        ...recordings,
        {
          id: 4,
          filename: 'd.mp4',
          start: '2026-07-05T09:00:00Z',
          url: '/recordings/cam1/d.mp4',
          is_recording: true,
          has_motion: false,
        },
      ])
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-1')).not.toBeNull()
      })
      expect(document.getElementById('history-recording-2')).not.toBeNull()
      expect(document.getElementById('history-recording-4')).toBeNull()
    })
  })

  describe('Player de histórico', () => {
    it('player de histórico usa a barra de controles própria do VideoPlayer (com fullscreen), não o <video controls> nativo', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-player-video')).not.toBeNull()
      })
      expect(document.getElementById('history-player-video')?.hasAttribute('controls')).toBe(false)
      expect(document.getElementById('history-player-controls')).not.toBeNull()
      expect(document.getElementById('history-player-fullscreen')).not.toBeNull()
      // Chip de reset de zoom só aparece com zoom ativo — ausente por padrão.
      expect(document.getElementById('history-player-zoom-reset')).toBeNull()
    })

    it('reprodução contínua vive no rodapé do player; o calendário vive no topo do sidebar de gravações', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-player-controls')).not.toBeNull()
      })
      const footer = document.getElementById('history-player-controls')!
      const sidebar = document.getElementById('history-recordings-list')!
      const toggle = document.getElementById('history-continuous-toggle')
      const picker = document.querySelector('[data-testid="history-datepicker"]')
      expect(toggle).not.toBeNull()
      expect(picker).not.toBeNull()
      expect(footer.contains(toggle)).toBe(true)
      expect(footer.contains(picker)).toBe(false)
      expect(sidebar.contains(picker)).toBe(true)
    })

    it('clicar num card da lista troca a gravação em reprodução', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-1')).not.toBeNull()
      })
      document
        .getElementById('history-recording-1')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        const video = document.getElementById('history-player-video') as HTMLVideoElement
        expect(video.getAttribute('src')).toBe('/recordings/cam1/a.mp4?token=tok')
      })
      expect(document.getElementById('history-recording-1')?.getAttribute('aria-current')).toBe(
        'true',
      )
      expect(
        document.getElementById('history-recording-2')?.getAttribute('aria-current'),
      ).toBeNull()
    })
  })

  describe('Estado vazio e calendário', () => {
    it('sem gravações no dia → sem player nem lista, mas calendário continua visível', async () => {
      stubFetch([])
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-header')?.textContent).toContain(
          'Corredor de entrada',
        )
      })
      // O sidebar em si continua existindo (é onde mora o calendário — precisa dar pra trocar
      // de dia mesmo sem nenhuma gravação), mas sem chips/lista (nada pra filtrar/mostrar).
      expect(document.getElementById('history-recordings-list')).not.toBeNull()
      expect(document.querySelector('[data-testid="history-datepicker"]')).not.toBeNull()
      expect(document.getElementById('history-filter-dropdown')).toBeNull()
      expect(document.getElementById('history-recordings-groups')).toBeNull()
      expect(document.querySelector('#history-player video')).toBeNull()
      expect(document.getElementById('history-player')?.textContent).toContain(
        'Sem gravações nesse dia',
      )
    })

    it('mostra o calendário, buscando os dias com conteúdo (content-days)', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.querySelector('[data-testid="history-datepicker"]')).not.toBeNull()
      })
      const picker = document.querySelector('[data-testid="history-datepicker"]')!
      expect(picker.getAttribute('data-available')).toBe(
        JSON.stringify(['2026-07-04', '2026-07-05']),
      )
    })

    it('trocar a data no calendário recarrega gravações/eventos daquele dia e reseleciona', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-1')).not.toBeNull()
      })
      document
        .querySelector('[data-testid="history-datepicker"] button')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(document.getElementById('history-recording-3')).not.toBeNull()
      })
      expect(document.getElementById('history-recording-1')).toBeNull()
      expect(document.getElementById('history-recording-3')?.getAttribute('aria-current')).toBe(
        'true',
      )
      await waitFor(() => {
        const video = document.getElementById('history-player-video') as HTMLVideoElement
        expect(video.getAttribute('src')).toBe('/recordings/cam1/c.mp4?token=tok')
      })
    })
  })

  describe('Loading e erro do player', () => {
    it('mostra loading até o vídeo carregar e volta a mostrar ao trocar de gravação', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-player-loading')).not.toBeNull()
      })
      const video = document.getElementById('history-player-video') as HTMLVideoElement
      video.dispatchEvent(new Event('loadeddata'))
      await waitFor(() => {
        expect(document.getElementById('history-player-loading')).toBeNull()
      })
      document
        .getElementById('history-recording-1')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
        expect(document.getElementById('history-player-loading')).toBeNull()
      })
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
      document
        .getElementById('history-recording-1')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(document.getElementById('history-player-error')).toBeNull()
      })
    })

    it('clicar no card já ativo não trava o loading (o <video> não remonta, "loadeddata" não dispara de novo)', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
      const video = document.getElementById('history-player-video') as HTMLVideoElement
      video.dispatchEvent(new Event('loadeddata'))
      await waitFor(() => {
        expect(document.getElementById('history-player-loading')).toBeNull()
      })
      document
        .getElementById('history-recording-2')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      expect(document.getElementById('history-player-loading')).toBeNull()
    })
  })

  describe('Atualização da lista via poll', () => {
    it('lista de gravações atualiza sozinha via poll (sem precisar recarregar a página)', async () => {
      vi.useFakeTimers()
      try {
        renderAt('/history/cam1')
        await vi.waitFor(() => {
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })
        stubFetch([
          ...recordings,
          {
            id: 5,
            filename: 'e.mp4',
            start: '2026-07-05T09:30:00Z',
            end: '2026-07-05T09:30:10Z',
            url: '/recordings/cam1/e.mp4',
            is_recording: false,
            has_motion: false,
          },
        ])
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000)
        })
        await vi.waitFor(() => {
          expect(document.getElementById('history-recording-5')).not.toBeNull()
        })
      } finally {
        vi.useRealTimers()
      }
    })

    it('só existindo 1 gravação, uma 2ª aparecer via poll NÃO reinicia o player (mesma src, sem voltar a carregar)', async () => {
      // Reproduz o relato: câmera recém-cadastrada, só 1 chunk finalizado por enquanto — sem
      // erro. Assim que o 2º chunk fecha e entra na lista (poll seguinte), o player não pode
      // reiniciar: a gravação já selecionada (a única que existia) continua sendo a mesma
      // gravação, só que agora com uma companheira mais nova na lista.
      const onlyOne = [recordings[1]] // só a.mp4 (id 1)
      stubFetch(onlyOne)
      vi.useFakeTimers()
      try {
        renderAt('/history/cam1')
        await vi.waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
        })
        const video = document.getElementById('history-player-video') as HTMLVideoElement
        video.dispatchEvent(new Event('loadeddata'))
        await vi.waitFor(() => {
          expect(document.getElementById('history-player-loading')).toBeNull()
        })
        const srcBefore = video.getAttribute('src')

        // 2ª gravação (mais nova) aparece — mesmo `id` de sempre pra a.mp4, sem qualquer
        // mudança nela.
        stubFetch(recordings) // a.mp4 (id 1) + b.mp4 (id 2, mais nova)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5_000)
        })
        await vi.waitFor(() => {
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })

        // A gravação ativa continua sendo a mesma (id 1) — não pulou pra mais nova (id 2) —
        // e o <video> não voltou a carregar (mesma src, loading não reapareceu).
        expect(document.getElementById('history-recording-1')?.getAttribute('aria-current')).toBe(
          'true',
        )
        expect(document.getElementById('history-player-loading')).toBeNull()
        expect(video.getAttribute('src')).toBe(srcBefore)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('Câmera inexistente e seleção via URL', () => {
    it('câmera inexistente → bloco de erro #history-error', async () => {
      // Câmera não está na lista (`cameras` fixture só tem 'cam1'), mas o efeito de
      // gravações/timeline do dia dispara de qualquer forma (não depende de `camera`
      // resolvida) — precisa de respostas bem-formadas nesses outros endpoints também,
      // senão sobra uma promise rejeitada (leitura de `.recordings`/`.buckets` de `[]`).
      stubFetch([])
      renderAt('/history/naoexiste')
      await waitFor(() => {
        expect(document.getElementById('history-error')?.textContent).toContain(
          'Câmera não encontrada',
        )
      })
    })

    it('abrir /history/:cameraId/:recordingId carrega o dia certo (não hoje) e seleciona a gravação', async () => {
      gateway.getRecording.mockResolvedValue({ filename: 'c.mp4', date: '2026-07-04' })
      renderAt('/history/cam1/3')
      await waitFor(() => {
        expect(document.getElementById('history-recording-3')).not.toBeNull()
      })
      expect(document.getElementById('history-recording-3')?.getAttribute('aria-current')).toBe(
        'true',
      )
      const video = document.getElementById('history-player-video') as HTMLVideoElement
      expect(video.getAttribute('src')).toBe('/recordings/cam1/c.mp4?token=tok')
      expect(
        document.querySelector('[data-testid="history-datepicker"]')?.getAttribute('data-value'),
      ).toBe('2026-07-04')
    })

    it('recordingId inexistente na URL → overlay centralizado no player (tela preta) some sozinho depois de um tempo, sem depender de qual carregamento (câmera/gravações) termina primeiro', async () => {
      gateway.getRecording.mockResolvedValue(null)
      vi.useFakeTimers()
      try {
        renderAt('/history/cam1/999')
        await vi.waitFor(() => {
          expect(document.getElementById('history-recording-not-found')).not.toBeNull()
        })
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5_000)
        })
        await vi.waitFor(() => {
          expect(document.getElementById('history-recording-not-found')).toBeNull()
        })
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

      document
        .getElementById('history-recording-1')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(currentPathname()).toBe('/history/cam1/1')
      })
    })

    it('gravação selecionada apagada pelo cleaner (via poll) → troca pra outra ainda existente, sem cair em "Sem gravações nesse dia"', async () => {
      vi.useFakeTimers()
      try {
        renderAt('/history/cam1')
        await vi.waitFor(() => {
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })
        stubFetch([recordings[1]]) // b.mp4 (id 2, selecionada) some
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000)
        })
        await vi.waitFor(() => {
          expect(document.getElementById('history-recording-1')?.getAttribute('aria-current')).toBe(
            'true',
          )
        })
        expect(document.getElementById('history-player')?.textContent).not.toContain(
          'Sem gravações nesse dia',
        )
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('Reprodução contínua', () => {
    it('toggle de reprodução contínua fica desabilitado sem gravações no dia', async () => {
      stubFetch([])
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-continuous-toggle')).not.toBeNull()
      })
      expect(document.getElementById('history-continuous-toggle')?.hasAttribute('disabled')).toBe(
        true,
      )
    })

    it('reprodução contínua: liga a partir da selecionada, encadeia em direção às mais NOVAS e mantém a URL/lista sincronizados ao avançar; desliga volta pro clipe único', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
      document
        .getElementById('history-recording-1')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        const video = document.getElementById('history-player-video') as HTMLVideoElement
        expect(video.getAttribute('src')).toBe('/recordings/cam1/a.mp4?token=tok')
      })

      document
        .getElementById('history-continuous-toggle')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(
          document.getElementById('history-continuous-toggle')?.getAttribute('aria-checked'),
        ).toBe('true')
      })

      // Fim natural do 1º arquivo (a.mp4, 42s) → avança pro próximo, mais novo (b.mp4).
      const video = document.getElementById('history-player-video') as HTMLVideoElement
      video.dispatchEvent(new Event('ended'))

      await waitFor(() => {
        expect(document.getElementById('history-recording-2')?.getAttribute('aria-current')).toBe(
          'true',
        )
      })
      await waitFor(() => {
        expect(currentPathname()).toBe('/history/cam1/2')
      })

      document
        .getElementById('history-continuous-toggle')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(
          document.getElementById('history-continuous-toggle')?.getAttribute('aria-checked'),
        ).toBe('false')
      })
    })

    it('clicar num card da lista enquanto a reprodução contínua está ligada re-ancora a sequência nele, sem desligar', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
      document
        .getElementById('history-continuous-toggle')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(
          document.getElementById('history-continuous-toggle')?.getAttribute('aria-checked'),
        ).toBe('true')
      })
      document
        .getElementById('history-recording-1')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        const video = document.getElementById('history-player-video') as HTMLVideoElement
        expect(video.getAttribute('src')).toBe('/recordings/cam1/a.mp4?token=tok')
      })
      expect(
        document.getElementById('history-continuous-toggle')?.getAttribute('aria-checked'),
      ).toBe('true')
    })

    it('trocar de dia (calendário) desliga a reprodução contínua', async () => {
      renderAt('/history/cam1')
      await waitFor(() => {
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
      document
        .getElementById('history-continuous-toggle')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(
          document.getElementById('history-continuous-toggle')?.getAttribute('aria-checked'),
        ).toBe('true')
      })
      document
        .querySelector('[data-testid="history-datepicker"] button')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await waitFor(() => {
        expect(document.getElementById('history-recording-3')).not.toBeNull()
      })
      expect(
        document.getElementById('history-continuous-toggle')?.getAttribute('aria-checked'),
      ).toBe('false')
    })
  })

  describe('Filtro de categoria e lista agrupada por hora', () => {
    // selectFilter troca o valor do dropdown (`history-filter-dropdown`) e dispara o
    // `change` nativo — mesmo padrão de manipulação direta do DOM já usado no resto
    // deste arquivo (dispatchEvent), aplicado a um `<select>` controlado pelo React.
    function selectFilter(value: string) {
      const select = document.getElementById('history-filter-dropdown') as HTMLSelectElement
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }

    describe('CA2: dropdown remove (não esmaece) os cards fora do filtro ativo', () => {
      it('dropdown Tudo/Movimento/Contínua remove os cards fora do filtro, sem recarregar a página', async () => {
        // a.mp4 (07:12:00Z) sem evento → categoria "continua"; b.mp4 (08:03:00Z) com evento no
        // mesmo intervalo → categoria fiel ao label real ("carro").
        stubFetch(recordings, [{ time: '2026-07-05T08:03:30Z', label: 'carro' }])
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })

        selectFilter('continua')
        await waitFor(() => {
          expect(document.getElementById('history-recording-2')).toBeNull()
        })
        expect(document.getElementById('history-recording-1')).not.toBeNull()

        selectFilter('carro')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).toBeNull()
        })
        expect(document.getElementById('history-recording-2')).not.toBeNull()

        selectFilter('todos')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
        })
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })

      it('filtra por um label específico dinâmico (ex.: "carro") — remove os cards que não batem', async () => {
        // a.mp4 (07:12:00Z) sem evento → continua; b.mp4 (08:03:00Z) com evento "carro" no
        // mesmo intervalo → categoria "carro".
        stubFetch(recordings, [{ time: '2026-07-05T08:03:30Z', label: 'carro' }])
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })

        selectFilter('carro')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).toBeNull()
        })
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })

      it('a lista lateral remove (não esmaece) as gravações fora do filtro, e o grupo de hora sem nenhum item correspondente some inteiro', async () => {
        // a.mp4 (07:12:00Z) sem evento → continua; b.mp4 (08:03:00Z) com evento "pessoa
        // detectada" no mesmo intervalo → categoria pessoa.
        stubFetch(recordings, [{ time: '2026-07-05T08:03:30Z', label: 'pessoa detectada' }])
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })

        selectFilter('pessoa')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).toBeNull()
        })
        // a gravação fora do filtro é removida do DOM — o grupo da hora 7 (só tinha a.mp4)
        // some inteiro; a hora 8 (b.mp4, "pessoa") continua.
        expect(document.getElementById('history-hour-group-7')).toBeNull()
        expect(document.getElementById('history-recording-2')).not.toBeNull()
      })
    })

    describe('CA6: dropdown dinâmico com as categorias reais do dia, sempre com Tudo/Contínua', () => {
      it('o filtro é um DROPDOWN (não mais chips fixos) com Tudo + Contínua sempre presentes e só os labels que de fato existem nas gravações do dia', async () => {
        stubFetch(recordings, [{ time: '2026-07-05T08:03:30Z', label: 'carro' }])
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
        })
        expect(document.getElementById('history-filter-chips')).toBeNull()
        const select = document.getElementById('history-filter-dropdown') as HTMLSelectElement
        expect(select.tagName).toBe('SELECT')
        const options = Array.from(select.options).map((o) => o.value)
        // a.mp4 (07:12Z, sem evento) → continua; b.mp4 (08:03Z, label "carro") → categoria "carro".
        // "movimento"/"pessoa" NÃO aparecem — nenhuma gravação do dia cai nessas categorias.
        expect(options).toEqual(['todos', 'carro', 'continua'])
      })

      it('categorias dinâmicas aparecem ordenadas — pessoa primeiro, movimento depois, resto em ordem alfabética, Tudo/Contínua fixos nas pontas', async () => {
        stubFetch(recordings, [
          { time: '2026-07-05T07:12:30Z', label: 'gato' },
          { time: '2026-07-05T08:03:30Z', label: 'pessoa detectada' },
        ])
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
        })
        const select = document.getElementById('history-filter-dropdown') as HTMLSelectElement
        const options = Array.from(select.options).map((o) => o.value)
        expect(options).toEqual(['todos', 'pessoa', 'gato', 'continua'])
      })

      it('rótulos do dropdown são capitalizados (categoryLabel) — "Tudo"/"Carro"/"Contínua"', async () => {
        stubFetch(recordings, [{ time: '2026-07-05T08:03:30Z', label: 'carro' }])
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
        })
        const select = document.getElementById('history-filter-dropdown') as HTMLSelectElement
        const labels = Array.from(select.options).map((o) => o.textContent)
        expect(labels).toEqual(['Tudo', 'Carro', 'Contínua'])
      })

      it('REGRESSÃO: um filtro específico ativo (ex.: "carro") reseta pra "Tudo" ao trocar pro dia sem essa categoria — o dropdown nunca "mente" sobre o filtro realmente aplicado', async () => {
        // Bug relatado pelo code-reviewer: as opções do dropdown são dinâmicas por dia — sem
        // reset, o <select> caía sozinho pra "todos" no DOM (nenhuma <option> bate o value
        // antigo, comportamento padrão do HTML) mas o estado React continuava com o filtro
        // antigo, escondendo TUDO no dia novo sem explicação visível (dropdown mostrando
        // "Tudo" enquanto na prática um filtro impossível de bater continuava ativo).
        stubFetch(recordings, [{ time: '2026-07-05T08:03:30Z', label: 'carro' }])
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
        })
        selectFilter('carro')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).toBeNull()
        })

        // Troca pro dia 04/07 — só tem c.mp4 (recordingsJul4), sem nenhum evento "carro" (o
        // mock de /motion devolve os mesmos eventos pra qualquer data, mas nenhum cai dentro
        // do intervalo de c.mp4 — vira "continua").
        document
          .querySelector('[data-testid="history-datepicker"] button')!
          .dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await waitFor(() => {
          expect(document.getElementById('history-recording-3')).not.toBeNull()
        })

        const select = document.getElementById('history-filter-dropdown') as HTMLSelectElement
        expect(select.value).toBe('todos')
        // Não é só o <select> mentindo — o filtro de VERDADE (estado React) também voltou pra
        // "Tudo": o card do dia novo continua visível (nada some por engano).
        expect(document.getElementById('history-recording-3')).not.toBeNull()
      })
    })

    describe('CA3: a régua (HistoryTimeline) reflete o filtro ativo', () => {
      it('a régua do HistoryTimeline remove o bloco de hora fora do filtro ativo, em vez de colorir todas as horas do dia', async () => {
        // a.mp4 (07:12:00Z) sem evento → continua; b.mp4 (08:03:00Z) com evento "pessoa
        // detectada" no mesmo intervalo → categoria pessoa.
        stubFetch(recordings, [{ time: '2026-07-05T08:03:30Z', label: 'pessoa detectada' }])
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })

        // sem filtro (Tudo): as duas horas aparecem na régua, cada LINHA com a cor da própria
        // categoria.
        expect(document.getElementById('history-timeline-hour-7')).not.toBeNull()
        expect(document.getElementById('history-timeline-hour-8')).not.toBeNull()
        const line7 = document.querySelector('#history-timeline-hour-7 span')!
        const line8 = document.querySelector('#history-timeline-hour-8 span')!
        expect(line7.className).toContain('bg-blue-500') // continua
        expect(line8.className).toContain('bg-red-500') // pessoa

        selectFilter('pessoa')
        // com o filtro "Pessoa" ativo: a hora 7 (só tinha "continua", fora do filtro) some
        // inteira da régua; a hora 8 ("pessoa") continua, com a mesma cor de linha.
        await waitFor(() => {
          expect(document.getElementById('history-timeline-hour-7')).toBeNull()
        })
        expect(document.getElementById('history-timeline-hour-8')).not.toBeNull()
        expect(document.querySelector('#history-timeline-hour-8 span')!.className).toContain(
          'bg-red-500',
        )
      })
    })

    describe('CA4: filtro sem nenhuma gravação correspondente mostra estado vazio explícito', () => {
      it('filtro sem nenhuma gravação correspondente no dia mostra estado vazio explícito, com o dropdown ainda visível', async () => {
        // a.mp4 (07:12:00Z) com evento "carro" e b.mp4 (08:03:00Z) com evento "pessoa
        // detectada" — nenhuma gravação do dia é "continua". Selecionar o filtro fixo
        // "Contínua" (sempre presente nas opções, mesmo sem nenhuma gravação dessa categoria)
        // zera a lista visível.
        stubFetch(recordings, [
          { time: '2026-07-05T07:12:30Z', label: 'carro' },
          { time: '2026-07-05T08:03:30Z', label: 'pessoa detectada' },
        ])
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })

        selectFilter('continua')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).toBeNull()
        })
        expect(document.getElementById('history-recording-2')).toBeNull()
        expect(document.getElementById('history-recordings-empty')).not.toBeNull()
        // O dropdown continua visível/funcional — dá pra voltar a "Tudo".
        expect(document.getElementById('history-filter-dropdown')).not.toBeNull()

        selectFilter('todos')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
        })
        expect(document.getElementById('history-recordings-empty')).toBeNull()
      })
    })

    describe('Grupos por hora (colapsar/expandir)', () => {
      it('grupos por hora mostram a contagem e colapsam/expandem ao clicar no cabeçalho', async () => {
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
        })
        // a.mp4 (07:12Z) e b.mp4 (08:03Z) caem em grupos de hora diferentes, cada um com 1 item
        // (assume TZ=UTC no ambiente de teste, igual ao resto da suíte).
        const group7 = document.getElementById('history-hour-group-7')!
        const group8 = document.getElementById('history-hour-group-8')!
        expect(group7.textContent).toContain('07h — 1 gravação')
        expect(group8.textContent).toContain('08h — 1 gravação')

        group7.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).toBeNull()
        })
        expect(document.getElementById('history-recording-2')).not.toBeNull()

        group7.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await waitFor(() => {
          expect(document.getElementById('history-recording-1')).not.toBeNull()
        })
      })

      it('REGRESSÃO: fechar o grupo da hora que já contém o item ATIVO (ex.: a mais recente, selecionada por padrão) mantém o grupo fechado — não reabre sozinho', async () => {
        // Bug relatado pelo navigator ("a primeira hora eu não consigo fechar na seta"): o
        // ajuste-durante-o-render que reabre o grupo do item ativo rodava em TODO render, não
        // só quando a seleção de fato mudava — fechar manualmente o grupo que já continha o
        // item ativo era desfeito no próprio render seguinte, parecendo que o clique não
        // "pegava". b.mp4 (08:03Z, id 2) é a gravação mais recente — selecionada por padrão,
        // cai no grupo da hora 8.
        renderAt('/history/cam1')
        await waitFor(() => {
          expect(document.getElementById('history-recording-2')).not.toBeNull()
        })
        expect(document.getElementById('history-recording-2')?.getAttribute('aria-current')).toBe(
          'true',
        )
        const group8 = document.getElementById('history-hour-group-8')!
        group8.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await waitFor(() => {
          expect(document.getElementById('history-recording-2')).toBeNull()
        })
        // Continua fechado (não é só um instante entre renders) — aguarda mais um ciclo e
        // confirma que não reapareceu sozinho.
        await act(() => Promise.resolve())
        expect(document.getElementById('history-recording-2')).toBeNull()
        expect(document.getElementById('history-hour-group-8')?.getAttribute('aria-expanded')).toBe(
          'false',
        )
      })
    })
  })
})
