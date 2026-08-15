import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import RecordingsPage from './RecordingsPage'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../components/DatePicker', () => ({ default: () => <div data-testid="datepicker" /> }))

// RecordingPlayerModal (renderizado sempre, mesmo com open=false — ver comentário abaixo)
// chama useNotifications() incondicionalmente desde a story player-modal-recordings/T4
// (markReadByEvent ao resolver um evento) — sem este mock, useNotifications() lança "must be
// used inside NotificationProvider" e quebra todo teste do arquivo. As chamadas em si (CA5)
// já são verificadas isoladamente em RecordingPlayerModal.test.tsx; aqui só evita o crash.
vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markRead: vi.fn(),
    markReadByEvent: vi.fn(),
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

// RecordingsGateway (usada por useRecordingSegments dentro do RecordingPlayerModal, T2/T3 da
// story player-modal-recordings) captura globalThis.fetch no construtor e nasce a nível de
// módulo — mesmo padrão de VideoBrowserPage.test.tsx: mock do módulo, não do fetch cru.
const recordingsGatewayMock = vi.hoisted(() => ({
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
      getTimezone = recordingsGatewayMock.getTimezone
      getRecording = recordingsGatewayMock.getRecording
      listByDay = recordingsGatewayMock.listByDay
      getEvent = recordingsGatewayMock.getEvent
      getPlaybackWindow = recordingsGatewayMock.getPlaybackWindow
      playbackURL = (r: { url: string }) => `${r.url}?token=fake`
    },
  }
})

const cameras = [
  { id: 'cam1', name: 'Corredor' },
  { id: 'cam2', name: 'Quintal' },
]
const moments = [
  {
    camera_id: 'cam1',
    camera_name: 'Corredor',
    time: '2026-06-23T08:08:05Z',
    kind: 'state',
    label: 'aberto',
    category: 'estados:portão:aberto',
    frame: '/recordings/state_history/1/x.jpg',
    score: 0.9,
    recording_available: true,
  },
  {
    camera_id: 'cam2',
    camera_name: 'Quintal',
    time: '2026-06-23T07:00:00Z',
    kind: 'motion',
    label: 'pessoa',
    category: 'pessoa',
    frame: '20260623070000_motion.jpg',
    score: 0.5,
    recording_available: true,
  },
]
const recordings = [
  {
    id: 1,
    camera_id: 'cam1',
    camera_name: 'Corredor',
    start: '2026-06-23T23:50:00Z',
    has_motion: true,
    url: '/recordings/cam1/2026/06/23/c.mp4',
  },
  {
    id: 2,
    camera_id: 'cam2',
    camera_name: 'Quintal',
    start: '2026-06-23T10:00:00Z',
    has_motion: false,
    url: '/recordings/cam2/2026/06/23/a.mp4',
  },
]
// Gravações por câmera (endpoint usado por resolveEventRecordingUrl no clique de
// momento) — distinto de /api/recordings (global, usado pela própria aba Gravações).
const camRecordings: Record<string, Array<{ id: number; start: string }>> = {
  cam1: [{ id: 1, start: '2026-06-23T23:50:00Z' }],
  cam2: [{ id: 2, start: '2026-06-23T10:00:00Z' }],
}

beforeEach(() => {
  // RecordingPlayerModal (renderizado sempre, mesmo com open=false) chama
  // useRecordingSegments incondicionalmente, que já dispara getTimezone() no mount — sem um
  // default aqui, `.then()` em cima de um vi.fn() não configurado quebra TODO teste do
  // arquivo (não só os da CA4), já que o mock é definido a nível de módulo.
  recordingsGatewayMock.getTimezone.mockResolvedValue('UTC')
  recordingsGatewayMock.getRecording.mockResolvedValue(null)
  recordingsGatewayMock.listByDay.mockResolvedValue([])
  recordingsGatewayMock.getEvent.mockResolvedValue(null)
  recordingsGatewayMock.getPlaybackWindow.mockResolvedValue({ lead: 10, trail: 10 })
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (
        url.startsWith('/api/cameras/cam1/motion') ||
        url.startsWith('/api/cameras/cam2/motion')
      ) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ events: [] }),
        })
      }
      const camMatch = url.match(/^\/api\/cameras\/(cam\d)\/recordings\?/)
      if (camMatch) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ recordings: camRecordings[camMatch[1]] }),
        })
      }
      if (url.startsWith('/api/cameras'))
        return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
      if (url.startsWith('/api/recordings'))
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ recordings, total: 2 }),
        })
      if (url.startsWith('/api/moments'))
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ moments, total: 2, hasMore: false }),
        })
      return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Sonda sempre montada (fora do <Routes>, mesmo padrão de ReportsPage.test.tsx) —
// acompanha a URL corrente independente de qual <Route> casou.
function LocationProbeGlobal() {
  const l = useLocation()
  return <div id="test-location">{l.pathname}</div>
}

// A página se auto-redireciona (replace) de /recordings pra /recordings/:date/:hour(/:view)?
// assim que monta (mesmo padrão de ReportsPage/HistoryPage) — as 4 variantes de rota
// precisam existir no MemoryRouter de teste, senão o redirect derruba o match.
function renderRecordings(initialPath = '/recordings') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbeGlobal />
      <Routes>
        <Route path="/recordings" element={<RecordingsPage />} />
        <Route path="/recordings/:date" element={<RecordingsPage />} />
        <Route path="/recordings/:date/:hour" element={<RecordingsPage />} />
        <Route path="/recordings/:date/:hour/:view" element={<RecordingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function switchToRecordings() {
  const toggle = await waitFor(() => {
    const el = document.getElementById('recordings-view-recordings')
    if (!el) throw new Error('toggle Gravações não renderizou')
    return el
  })
  fireEvent.click(toggle)
}

describe('RecordingsPage', () => {
  it('por padrão lista os momentos do dia (view ausente na URL) e clique resolve e abre o player em modal (sem navegar)', async () => {
    renderRecordings()
    const card0 = await waitFor(() => {
      const el = document.getElementById('moment-0')
      if (!el) throw new Error('card não renderizou')
      return el
    })
    expect(card0.textContent).toContain('Corredor')
    expect(document.getElementById('moment-1')?.textContent).toContain('Quintal')

    const locationBefore = document.getElementById('test-location')!.textContent
    fireEvent.click(card0)
    // moments[0] é cam1 — âncora resolve pra recording id 1 (única gravação de cam1),
    // sem evento casado (mock de /motion devolve events: []) → sem :motionId. Abre o
    // modal (RecordingPlayerModal), não navega mais pra /recording/cam1/1.
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal')).not.toBeNull()
    })
    expect(document.getElementById('test-location')!.textContent).toBe(locationBefore)
  })

  it('URL reflete /recordings/:date/:hour sem sufixo de view (default moments)', async () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    renderRecordings()
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe(
        `/recordings/${y}-${m}-${d}/24`,
      )
    })
  })

  it('no modo Gravações (aba explícita) lista as gravações do dia, adiciona /recordings à URL e clique abre o player em modal direto (sem resolver via resolveEventRecordingUrl)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderRecordings()
    await switchToRecordings()
    const rec0 = await waitFor(() => {
      const el = document.getElementById('recording-1')
      if (!el) throw new Error('gravação não renderizou')
      return el
    })
    expect(rec0.textContent).toContain('Corredor')
    expect(document.getElementById('recording-2')?.textContent).toContain('Quintal')
    expect(document.getElementById('test-location')!.textContent).toMatch(
      /\/recordings\/\d{4}-\d{2}-\d{2}\/24\/recordings$/,
    )

    fetchMock.mockClear()
    fireEvent.click(rec0)
    // rec.id (1) já é conhecido — abre o modal direto, sem chamar resolveEventRecordingUrl
    // (sem fetch extra de /motion ou /cameras/:id/recordings) e sem navegar.
    await waitFor(() => {
      expect(document.getElementById('recording-player-modal')).not.toBeNull()
    })
    expect(document.getElementById('test-location')!.textContent).toMatch(
      /\/recordings\/\d{4}-\d{2}-\d{2}\/24\/recordings$/,
    )
    expect(fetchMock.mock.calls.some(([u]: [string]) => String(u).includes('/motion?date='))).toBe(
      false,
    )
  })

  it('a janela dispara fetch de /api/recordings com window e motion_only (aba Gravações)', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderRecordings()
    await switchToRecordings()
    const win6 = await waitFor(() => {
      const el = document.getElementById('recordings-window-6')
      if (!el) throw new Error('chip de janela não renderizou')
      return el
    })
    fireEvent.click(win6)
    fireEvent.click(document.getElementById('recordings-motion-only')!)

    await waitFor(() => {
      const called = fetchMock.mock.calls.some(
        ([u]: [string]) =>
          u.startsWith('/api/recordings') &&
          u.includes('window=6') &&
          u.includes('motion_only=true'),
      )
      if (!called) throw new Error('fetch com window=6&motion_only não disparou')
    })
  })

  it('digitar na busca (modo Momentos, default) dispara fetch com q (debounced) e reseta a página', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderRecordings()
    const input = await waitFor(() => {
      const el = document.getElementById('recordings-search') as HTMLInputElement | null
      if (!el) throw new Error('campo de busca não renderizou')
      return el
    })

    fireEvent.change(input, { target: { value: 'portao' } })

    await waitFor(
      () => {
        const called = fetchMock.mock.calls.some(
          ([u]: [string]) =>
            u.startsWith('/api/moments') && u.includes('q=portao') && u.includes('page=1'),
        )
        if (!called) throw new Error('fetch com q=portao não disparou')
      },
      { timeout: 1500 },
    )
  })

  it('abrir /recordings/2026-06-23/6/recordings carrega direto na aba Gravações com a data e janela da URL', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderRecordings('/recordings/2026-06-23/6/recordings')
    await waitFor(() => {
      expect(document.getElementById('recording-1')).toBeTruthy()
    })
    expect(document.getElementById('recordings-view-recordings')?.className).toContain('bg-primary')
    const called = fetchMock.mock.calls.some(
      ([u]: [string]) =>
        u.startsWith('/api/recordings') && u.includes('date=2026-06-23') && u.includes('window=6'),
    )
    expect(called).toBe(true)
  })

  describe('CA5: filtro de categoria dinâmico (modo Momentos)', () => {
    // Momentos com um label específico dinâmico (ex.: "carro") além dos 2 padrão
    // (estados/pessoa) — servidor filtra por `category` quando presente, igual à API real.
    const dynamicMoments = [
      ...moments,
      {
        camera_id: 'cam1',
        camera_name: 'Corredor',
        time: '2026-06-23T09:00:00Z',
        kind: 'motion' as const,
        label: 'carro',
        category: 'carro',
        frame: '20260623090000_motion.jpg',
        score: 0.7,
      },
    ]

    // Universo fixo de categorias do dia — mesmo contrato do backend real
    // (internal/server/moments.go: `categories` no JSON, independente do filtro
    // `category` ativo, ver story fix-chips-categoria-somem-multiselecao).
    const dynamicCategories = [...new Set(dynamicMoments.map((m) => m.category))]

    function stubMomentsFetch() {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/moments')) {
            // `category` é CSV (0..N categorias) — mesmo contrato do backend real
            // (moments.go), ver CA1/CA2 da story filtro-multiplo-recordings.
            const cat = new URL(url, 'http://x').searchParams.get('category')
            const cats = cat ? cat.split(',').map((c) => c.trim()) : null
            const filtered = cats
              ? dynamicMoments.filter((m) => cats.includes(m.category))
              : dynamicMoments
            return Promise.resolve({
              status: 200,
              json: () =>
                Promise.resolve({
                  moments: filtered,
                  total: filtered.length,
                  hasMore: false,
                  categories: dynamicCategories,
                }),
            })
          }
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
          return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
        }),
      )
    }

    it('REGRESSÃO: "estados" sempre fica por ÚLTIMO na ordenação, mesmo perdendo alfabeticamente pra outro label dinâmico', async () => {
      // "estados" vem antes de "zebra" em ordem alfabética pura ('e' < 'z') — a regra da
      // story exige "estados" sempre por último, independente disso (mesma convenção de
      // ReportsPage.tsx). Reproduz com fetch próprio (não usa `dynamicMoments`/
      // `stubMomentsFetch` do describe, que só tem "carro" — alfabeticamente ANTES de
      // "estados", não pegaria a regressão).
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/moments')) {
            const withZebra = [
              ...moments,
              {
                camera_id: 'cam1',
                camera_name: 'Corredor',
                time: '2026-06-23T09:00:00Z',
                kind: 'motion' as const,
                label: 'zebra',
                category: 'zebra',
                frame: '20260623090000_motion.jpg',
                score: 0.7,
              },
            ]
            return Promise.resolve({
              status: 200,
              json: () =>
                Promise.resolve({
                  moments: withZebra,
                  total: withZebra.length,
                  hasMore: false,
                  categories: [...new Set(withZebra.map((m) => m.category))],
                }),
            })
          }
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
          return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
        }),
      )
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      const chips = Array.from(
        document.getElementById('recordings-category-chips')!.querySelectorAll('button'),
      ).map((b) => b.id)
      expect(chips).toEqual([
        'recordings-cat-todos',
        'recordings-cat-pessoa',
        'recordings-cat-zebra',
        'recordings-cat-estados:portão:aberto',
      ])
    })

    it('as opções do filtro são dinâmicas — refletem as categorias REAIS dos momentos carregados, não um array fixo', async () => {
      stubMomentsFetch()
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      const chips = Array.from(
        document.getElementById('recordings-category-chips')!.querySelectorAll('button'),
      ).map((b) => b.id)
      // pessoa primeiro, "carro" (alfabético entre os específicos) antes de "estados".
      expect(chips).toEqual([
        'recordings-cat-todos',
        'recordings-cat-pessoa',
        'recordings-cat-carro',
        'recordings-cat-estados:portão:aberto',
      ])
    })

    it('clicar num chip de categoria dinâmica (ex.: "carro") filtra via query param e mostra só esses momentos', async () => {
      stubMomentsFetch()
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      fetchMock.mockClear()
      fireEvent.click(document.getElementById('recordings-cat-carro')!)
      await waitFor(() => {
        const called = fetchMock.mock.calls.some(
          ([u]: [string]) =>
            String(u).startsWith('/api/moments') && String(u).includes('category=carro'),
        )
        if (!called) throw new Error('fetch com category=carro não disparou')
      })
      await waitFor(() => {
        expect(document.getElementById('moment-0')?.textContent).toContain('Corredor')
        expect(document.getElementById('moment-1')).toBeNull()
      })
    })

    it('rótulos dos chips são capitalizados (categoryLabel) — "Todos"/"Pessoa"/"Carro"/"Estados: Portão · aberto"', async () => {
      stubMomentsFetch()
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      const labels = Array.from(
        document.getElementById('recordings-category-chips')!.querySelectorAll('button'),
      ).map((b) => b.textContent?.trim())
      expect(labels).toEqual(['Todos', 'Pessoa', 'Carro', 'Estados: Portão · aberto'])
    })

    it('o chip da categoria ATIVA nunca desaparece, mesmo quando o servidor filtra a resposta pra só ela', async () => {
      stubMomentsFetch()
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      fireEvent.click(document.getElementById('recordings-cat-carro')!)
      await waitFor(() => {
        expect(document.getElementById('moment-1')).toBeNull() // já filtrado, só 1 momento
      })
      // mesmo com a resposta de `moments` contendo só "carro", o chip "carro" continua na
      // lista (é o próprio filtro ativo) — e os demais (pessoa/estados) TAMBÉM continuam
      // visíveis, já que `filterOptions` deriva de `categories` (universo fixo do dia),
      // não da resposta filtrada (ver story fix-chips-categoria-somem-multiselecao).
      expect(document.getElementById('recordings-cat-carro')).not.toBeNull()
      expect(document.getElementById('recordings-cat-todos')).not.toBeNull()
      expect(document.getElementById('recordings-cat-pessoa')).not.toBeNull()
      expect(document.getElementById('recordings-cat-estados:portão:aberto')).not.toBeNull()
    })
  })

  describe('CA3: filtro de categoria multi-seleção (modo Momentos)', () => {
    // 3 categorias distintas pra exercitar seleção de 2 ao mesmo tempo.
    const multiMoments = [
      ...moments,
      {
        camera_id: 'cam1',
        camera_name: 'Corredor',
        time: '2026-06-23T09:00:00Z',
        kind: 'motion' as const,
        label: 'carro',
        category: 'carro',
        frame: '20260623090000_motion.jpg',
        score: 0.7,
      },
    ]

    const multiCategories = [...new Set(multiMoments.map((m) => m.category))]

    function stubMultiMomentsFetch() {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/moments')) {
            const cat = new URL(url, 'http://x').searchParams.get('category')
            const cats = cat ? cat.split(',').map((c) => c.trim()) : null
            const filtered = cats
              ? multiMoments.filter((m) => cats.includes(m.category))
              : multiMoments
            return Promise.resolve({
              status: 200,
              json: () =>
                Promise.resolve({
                  moments: filtered,
                  total: filtered.length,
                  hasMore: false,
                  categories: multiCategories,
                }),
            })
          }
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
          return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
        }),
      )
    }

    it('clicar em 2 chips distintos ativa os DOIS (toggle aditivo, não substituição) e busca via CSV', async () => {
      stubMultiMomentsFetch()
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      fireEvent.click(document.getElementById('recordings-cat-pessoa')!)
      fetchMock.mockClear()
      fireEvent.click(document.getElementById('recordings-cat-carro')!)
      await waitFor(() => {
        const called = fetchMock.mock.calls.some(([u]: [string]) => {
          const s = String(u)
          if (!s.startsWith('/api/moments')) return false
          const cat = new URL(s, 'http://x').searchParams.get('category')
          const cats = cat?.split(',') ?? []
          return cats.includes('pessoa') && cats.includes('carro') && cats.length === 2
        })
        if (!called) throw new Error('fetch com category=pessoa,carro (CSV) não disparou')
      })
      expect(document.getElementById('recordings-cat-pessoa')?.className).toContain('bg-primary')
      expect(document.getElementById('recordings-cat-carro')?.className).toContain('bg-primary')
    })

    it('clicar de novo num chip já ativo desliga só ELE, mantendo os outros selecionados', async () => {
      stubMultiMomentsFetch()
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      fireEvent.click(document.getElementById('recordings-cat-pessoa')!)
      fireEvent.click(document.getElementById('recordings-cat-carro')!)
      await waitFor(() => {
        expect(document.getElementById('recordings-cat-carro')?.className).toContain('bg-primary')
      })
      fireEvent.click(document.getElementById('recordings-cat-carro')!)
      await waitFor(() => {
        expect(document.getElementById('recordings-cat-carro')?.className).not.toContain(
          'bg-primary',
        )
      })
      expect(document.getElementById('recordings-cat-pessoa')?.className).toContain('bg-primary')
    })

    it('clicar em "Todos" com filtros ativos limpa a seleção inteira (nenhum outro chip fica ativo)', async () => {
      stubMultiMomentsFetch()
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      fireEvent.click(document.getElementById('recordings-cat-pessoa')!)
      fireEvent.click(document.getElementById('recordings-cat-carro')!)
      await waitFor(() => {
        expect(document.getElementById('recordings-cat-carro')?.className).toContain('bg-primary')
      })
      fetchMock.mockClear()
      fireEvent.click(document.getElementById('recordings-cat-todos')!)
      await waitFor(() => {
        const called = fetchMock.mock.calls.some(([u]: [string]) => {
          const s = String(u)
          return (
            s.startsWith('/api/moments') && !new URL(s, 'http://x').searchParams.has('category')
          )
        })
        if (!called) throw new Error('fetch sem category (todos) não disparou')
      })
      expect(document.getElementById('recordings-cat-todos')?.className).toContain('bg-primary')
      expect(document.getElementById('recordings-cat-pessoa')?.className).not.toContain(
        'bg-primary',
      )
      expect(document.getElementById('recordings-cat-carro')?.className).not.toContain('bg-primary')
    })
  })

  describe('CA3: chips de categoria não desaparecem com filtro ativo (fix multi-seleção)', () => {
    // Mesmas 3 categorias de CA3 acima (pessoa/carro/estados), mas o servidor devolve o
    // universo FIXO de categorias do dia via `categories` — independente do `category`
    // ativo na query, ao contrário de `moments` (que o servidor real filtra de verdade).
    const stableMoments = [
      ...moments,
      {
        camera_id: 'cam1',
        camera_name: 'Corredor',
        time: '2026-06-23T09:00:00Z',
        kind: 'motion' as const,
        label: 'carro',
        category: 'carro',
        frame: '20260623090000_motion.jpg',
        score: 0.7,
      },
    ]

    function stubStableCategoriesFetch() {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/moments')) {
            const cat = new URL(url, 'http://x').searchParams.get('category')
            const cats = cat ? cat.split(',').map((c) => c.trim()) : null
            const filtered = cats
              ? stableMoments.filter((m) => cats.includes(m.category))
              : stableMoments
            return Promise.resolve({
              status: 200,
              json: () =>
                Promise.resolve({
                  moments: filtered,
                  total: filtered.length,
                  hasMore: false,
                  categories: ['carro', 'estados:portão:aberto', 'pessoa'],
                }),
            })
          }
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
          return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
        }),
      )
    }

    it('REGRESSÃO: depois que o fetch filtrado por 1 categoria já resolveu, os OUTROS chips continuam visíveis (não somem)', async () => {
      stubStableCategoriesFetch()
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      fireEvent.click(document.getElementById('recordings-cat-pessoa')!)
      // espera o fetch FILTRADO resolver de verdade (a lista de momentos encolhe pra só
      // "pessoa", igual ao servidor real faria) antes de checar os chips — reproduz o
      // fluxo real do usuário (clique → resposta chega → só então o 2º clique), não o
      // timing artificial de fireEvent síncrono sem await entre 2 cliques.
      await waitFor(() => {
        expect(document.getElementById('moment-1')).toBeNull()
      })
      expect(document.getElementById('recordings-cat-carro')).not.toBeNull()
      expect(document.getElementById('recordings-cat-estados:portão:aberto')).not.toBeNull()
    })

    it('permite adicionar uma 2ª categoria DEPOIS que o fetch da 1ª já resolveu (fluxo real, não uma corrida de timing)', async () => {
      stubStableCategoriesFetch()
      const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      fireEvent.click(document.getElementById('recordings-cat-pessoa')!)
      await waitFor(() => {
        expect(document.getElementById('moment-1')).toBeNull()
      })
      fetchMock.mockClear()
      fireEvent.click(document.getElementById('recordings-cat-carro')!)
      await waitFor(() => {
        const called = fetchMock.mock.calls.some(([u]: [string]) => {
          const s = String(u)
          if (!s.startsWith('/api/moments')) return false
          const cat = new URL(s, 'http://x').searchParams.get('category')
          const cats = cat?.split(',') ?? []
          return cats.includes('pessoa') && cats.includes('carro') && cats.length === 2
        })
        if (!called) throw new Error('fetch com category=pessoa,carro não disparou')
      })
      expect(document.getElementById('recordings-cat-pessoa')?.className).toContain('bg-primary')
      expect(document.getElementById('recordings-cat-carro')?.className).toContain('bg-primary')
    })
  })

  describe('CA4: player em modal — clicar numa gravação/momento abre o player sem sair de /recordings', () => {
    beforeEach(() => {
      recordingsGatewayMock.getTimezone.mockResolvedValue('UTC')
      recordingsGatewayMock.getRecording.mockResolvedValue({
        filename: 'c.mp4',
        date: '2026-06-23',
      })
      recordingsGatewayMock.listByDay.mockResolvedValue([
        {
          id: 1,
          filename: 'c.mp4',
          start: '2026-06-23T23:50:00Z',
          url: '/recordings/cam1/2026/06/23/c.mp4',
          is_recording: false,
          has_motion: true,
        },
      ])
      recordingsGatewayMock.getEvent.mockResolvedValue(null)
      recordingsGatewayMock.getPlaybackWindow.mockResolvedValue({ lead: 5, trail: 10 })
    })

    it('clicar numa gravação (aba Gravações) abre o modal com o player, sem navegar pra /recording/...', async () => {
      renderRecordings()
      await switchToRecordings()
      const rec0 = await waitFor(() => {
        const el = document.getElementById('recording-1')
        if (!el) throw new Error('gravação não renderizou')
        return el
      })
      fireEvent.click(rec0)
      await waitFor(() => {
        expect(document.getElementById('recording-player-modal')).not.toBeNull()
      })
      expect(document.getElementById('test-location')!.textContent).not.toBe('/recording/cam1/1')
    })

    it('clicar num momento abre o modal (resolve cameraId/recordingId via resolveEventRecordingUrl), sem navegar', async () => {
      renderRecordings()
      const card0 = await waitFor(() => {
        const el = document.getElementById('moment-0')
        if (!el) throw new Error('card não renderizou')
        return el
      })
      fireEvent.click(card0)
      await waitFor(() => {
        expect(document.getElementById('recording-player-modal')).not.toBeNull()
      })
      expect(document.getElementById('test-location')!.textContent).toMatch(/^\/recordings/)
    })

    it('fechar o modal (botão) some com o player e mantém a página em /recordings', async () => {
      renderRecordings()
      await switchToRecordings()
      const rec0 = await waitFor(() => {
        const el = document.getElementById('recording-1')
        if (!el) throw new Error('gravação não renderizou')
        return el
      })
      fireEvent.click(rec0)
      await waitFor(() => {
        expect(document.getElementById('recording-player-modal')).not.toBeNull()
      })
      fireEvent.click(document.getElementById('recording-player-modal-close')!)
      await waitFor(() => {
        expect(document.getElementById('recording-player-modal')).toBeNull()
      })
      expect(document.getElementById('test-location')!.textContent).toMatch(/^\/recordings/)
    })
  })

  describe('CA4: card de momento sem gravação disponível mostra aviso e fica desabilitado', () => {
    beforeEach(() => {
      const momentsWithUnavailable = [
        { ...moments[0], recording_available: true },
        { ...moments[1], recording_available: false },
      ]
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
          if (url.startsWith('/api/content-days'))
            return Promise.resolve({ status: 200, json: () => Promise.resolve({ days: [] }) })
          if (url.startsWith('/api/moments'))
            return Promise.resolve({
              status: 200,
              json: () =>
                Promise.resolve({ moments: momentsWithUnavailable, total: 2, hasMore: false }),
            })
          return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
        }),
      )
    })

    it('card sem gravação (recording_available=false) mostra o aviso e não abre o player ao clicar', async () => {
      renderRecordings()
      const unavailable = await waitFor(() => {
        const el = document.getElementById('moment-1')
        if (!el) throw new Error('card não renderizou')
        return el
      })
      expect(unavailable.textContent).toContain('Sem gravação')
      expect(unavailable).toHaveProperty('disabled', true)
      fireEvent.click(unavailable)
      // dá tempo pra qualquer resolução assíncrona indevida (resolveEventRecordingUrl)
      // rodar, se o clique tivesse disparado por engano.
      await new Promise((r) => setTimeout(r, 0))
      expect(document.getElementById('recording-player-modal')).toBeNull()
    })

    it('card com gravação disponível não mostra o aviso e continua clicável', async () => {
      renderRecordings()
      const available = await waitFor(() => {
        const el = document.getElementById('moment-0')
        if (!el) throw new Error('card não renderizou')
        return el
      })
      expect(available.textContent).not.toContain('Sem gravação')
      expect(available).toHaveProperty('disabled', false)
    })
  })
})
