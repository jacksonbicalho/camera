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
    kind: 'motion',
    label: 'aberto',
    category: 'aberto',
    frame: '20260623080805_motion.jpg',
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
    // (aberto/pessoa) — servidor filtra por `category` quando presente, igual à API real.
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

    it('as opções do filtro são dinâmicas — refletem as categorias REAIS dos momentos carregados, não um array fixo', async () => {
      stubMomentsFetch()
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      const chips = Array.from(
        document.getElementById('recordings-category-chips')!.querySelectorAll('button'),
      ).map((b) => b.id)
      // pessoa primeiro, resto em ordem alfabética ("aberto" antes de "carro").
      expect(chips).toEqual([
        'recordings-cat-todos',
        'recordings-cat-pessoa',
        'recordings-cat-aberto',
        'recordings-cat-carro',
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

    it('rótulos dos chips são capitalizados (categoryLabel) — "Todos"/"Pessoa"/"Aberto"/"Carro"', async () => {
      stubMomentsFetch()
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      const labels = Array.from(
        document.getElementById('recordings-category-chips')!.querySelectorAll('button'),
      ).map((b) => b.textContent?.trim())
      expect(labels).toEqual(['Todos', 'Pessoa', 'Aberto', 'Carro'])
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
      // lista (é o próprio filtro ativo) — e os demais (pessoa/aberto) TAMBÉM continuam
      // visíveis, já que `filterOptions` deriva de `categories` (universo fixo do dia),
      // não da resposta filtrada (ver story fix-chips-categoria-somem-multiselecao).
      expect(document.getElementById('recordings-cat-carro')).not.toBeNull()
      expect(document.getElementById('recordings-cat-todos')).not.toBeNull()
      expect(document.getElementById('recordings-cat-pessoa')).not.toBeNull()
      expect(document.getElementById('recordings-cat-aberto')).not.toBeNull()
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
    // Mesmas 3 categorias de CA3 acima (pessoa/carro/aberto), mas o servidor devolve o
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
                  categories: ['carro', 'aberto', 'pessoa'],
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
      expect(document.getElementById('recordings-cat-aberto')).not.toBeNull()
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

  describe('CA4: card de momento sem gravação disponível mostra aviso visual', () => {
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

    it('card sem gravação (recording_available=false) mostra o overlay "Sem gravação"', async () => {
      renderRecordings()
      const unavailable = await waitFor(() => {
        const el = document.getElementById('moment-1')
        if (!el) throw new Error('card não renderizou')
        return el
      })
      expect(unavailable.textContent).toContain('Sem gravação')
      // clicável (T4: abre o lightbox da imagem em vez do player — ver CA6), não mais
      // desabilitado — só o comportamento do clique mudou, testado em CA6.
      expect(unavailable).toHaveProperty('disabled', false)
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

  describe('CA5: filtro "só com gravação" (client-side, Momentos)', () => {
    beforeEach(() => {
      const mixed = [
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
              json: () => Promise.resolve({ moments: mixed, total: 2, hasMore: false }),
            })
          return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
        }),
      )
    })

    it('desativado (default), mostra os 2 cards — disponível e indisponível', async () => {
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
        expect(document.getElementById('moment-1')).not.toBeNull()
      })
    })

    it('ativado, esconde os cards sem gravação disponível', async () => {
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      fireEvent.click(document.getElementById('recordings-recording-only')!)
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
        expect(document.getElementById('moment-1')).toBeNull()
      })
    })

    it('ativado, ao carregar mais continua escondendo os cards sem gravação (página 2)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve(cameras),
            })
          if (url.startsWith('/api/content-days'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ days: [] }),
            })
          if (url.startsWith('/api/moments')) {
            const page = new URL(url, 'http://x').searchParams.get('page')
            if (page === '2') {
              return Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                  Promise.resolve({
                    moments: [
                      {
                        ...moments[1],
                        time: '2026-06-23T06:00:00Z',
                        recording_available: false,
                      },
                    ],
                    total: 3,
                    hasMore: false,
                  }),
              })
            }
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({
                  moments: [
                    { ...moments[0], recording_available: true },
                    { ...moments[1], recording_available: false },
                  ],
                  total: 3,
                  hasMore: true,
                }),
            })
          }
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
        }),
      )
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-0')).not.toBeNull()
      })
      fireEvent.click(document.getElementById('recordings-recording-only')!)
      await waitFor(() => {
        expect(document.getElementById('moment-1')).toBeNull()
      })
      fireEvent.click(document.getElementById('recordings-load-more')!)
      await waitFor(() => {
        const cards = Array.from(document.querySelectorAll('#recordings-grid button'))
        expect(cards.length).toBeGreaterThan(0)
        for (const el of cards) {
          expect(el.textContent).not.toContain('Sem gravação')
        }
      })
    })
  })

  describe('CA6: clique num card sem gravação abre um lightbox com a imagem', () => {
    beforeEach(() => {
      const momentsWithUnavailable = [
        { ...moments[0], recording_available: true },
        { ...moments[1], recording_available: false },
      ]
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          // resolveEventRecordingUrl (clique num momento DISPONÍVEL) busca eventos +
          // gravações do dia da câmera pra resolver cameraId/recordingId/motionId — mesmo
          // par de rotas que o beforeEach padrão do arquivo já mocka.
          if (url.match(/^\/api\/cameras\/(cam\d)\/motion\?/))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ events: [] }),
            })
          const camMatch = url.match(/^\/api\/cameras\/(cam\d)\/recordings\?/)
          if (camMatch)
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ recordings: camRecordings[camMatch[1]] }),
            })
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve(cameras),
            })
          if (url.startsWith('/api/content-days'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ days: [] }),
            })
          if (url.startsWith('/api/moments'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({ moments: momentsWithUnavailable, total: 2, hasMore: false }),
            })
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
        }),
      )
    })

    it('clicar num card sem gravação abre o lightbox com a imagem, não o player', async () => {
      renderRecordings()
      const unavailable = await waitFor(() => {
        const el = document.getElementById('moment-1')
        if (!el) throw new Error('card não renderizou')
        return el
      })
      fireEvent.click(unavailable)
      await waitFor(() => {
        expect(document.getElementById('moment-lightbox')).not.toBeNull()
      })
      expect(document.getElementById('recording-player-modal')).toBeNull()
      fireEvent.click(document.getElementById('moment-lightbox-close')!)
      await waitFor(() => {
        expect(document.getElementById('moment-lightbox')).toBeNull()
      })
    })

    it('clicar num card com gravação continua abrindo o player, não o lightbox', async () => {
      renderRecordings()
      const available = await waitFor(() => {
        const el = document.getElementById('moment-0')
        if (!el) throw new Error('card não renderizou')
        return el
      })
      fireEvent.click(available)
      await waitFor(() => {
        expect(document.getElementById('recording-player-modal')).not.toBeNull()
      })
      expect(document.getElementById('moment-lightbox')).toBeNull()
    })

    it('Esc fecha o lightbox', async () => {
      renderRecordings()
      const unavailable = await waitFor(() => {
        const el = document.getElementById('moment-1')
        if (!el) throw new Error('card não renderizou')
        return el
      })
      fireEvent.click(unavailable)
      await waitFor(() => {
        expect(document.getElementById('moment-lightbox')).not.toBeNull()
      })
      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => {
        expect(document.getElementById('moment-lightbox')).toBeNull()
      })
    })
  })

  describe('CA3: "Carregar mais" busca páginas extras automaticamente até preencher a linha da grade', () => {
    const originalInnerWidth = window.innerWidth

    beforeEach(() => {
      // base (sem breakpoint sm/md/lg) = 2 colunas na grade de Momentos.
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      })
    })

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      })
    })

    function momentAt(i: number, over: Partial<(typeof moments)[number]> = {}) {
      return {
        ...moments[0],
        time: `2026-06-23T${String(i).padStart(2, '0')}:00:00Z`,
        camera_id: 'cam1',
        camera_name: 'Corredor',
        recording_available: true,
        ...over,
      }
    }

    it('1 clique em "Carregar mais" busca quantas páginas forem necessárias pra fechar a linha (2 colunas), sem exigir cliques extras', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cameras) })
          if (url.startsWith('/api/content-days'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ days: [] }),
            })
          if (url.startsWith('/api/moments')) {
            const page = new URL(url, 'http://x').searchParams.get('page')
            // página 1: 2 momentos (linha completa) — carga inicial, sem auto-continuação.
            if (page === '1')
              return Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                  Promise.resolve({ moments: [momentAt(0), momentAt(1)], total: 5, hasMore: true }),
              })
            // página 2 (via clique manual): 1 momento — total 3, ímpar, NÃO fecha a linha de 2.
            if (page === '2')
              return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ moments: [momentAt(2)], total: 5, hasMore: true }),
              })
            // página 3 (auto, sem novo clique): 1 momento — total 4, fecha a linha. Para aqui.
            if (page === '3')
              return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ moments: [momentAt(3)], total: 5, hasMore: true }),
              })
            throw new Error(`página inesperada buscada automaticamente: ${page}`)
          }
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
        }),
      )
      renderRecordings()
      await waitFor(() => {
        expect(document.getElementById('moment-1')).not.toBeNull()
        expect(document.getElementById('moment-2')).toBeNull()
      })

      fireEvent.click(document.getElementById('recordings-load-more')!)

      // timeout maior que o default (1000ms): esta cadeia encadeia 2 idas-e-voltas
      // fetch→effect→setPage antes de assentar — sob contenção de CPU (ex. suíte inteira
      // rodando em paralelo) o default pode não ser suficiente, achado real de flakiness
      // em code review (3/5 falhas reproduzidas em bash scripts/check.sh).
      await waitFor(
        () => {
          expect(document.getElementById('moment-3')).not.toBeNull()
        },
        { timeout: 5000 },
      )
      // não deve ter tentado buscar página 4 (a linha já fechou em 4 = 2×2) — espera a
      // rota da página 3 assentar (já concluída, pelo waitFor acima) e confirma que uma
      // nova rodada de microtasks não disparou mais nada além disso.
      await waitFor(() => expect(document.getElementById('moment-3')).not.toBeNull())
      expect(document.getElementById('moment-4')).toBeNull()
      // timeout do teste (não só do waitFor interno) maior que o default do Vitest
      // (5000ms) — achado real de flakiness em code review: o testTimeout global
      // matava o teste ANTES do waitFor interno (já ajustado) ter chance de resolver
      // sob contenção de CPU (mesma classe de flakiness já documentada em vite.config.ts,
      // história chore/limpeza-followups-e-flakiness-testes).
    }, 10000)

    it('com "Só com gravação" ativo, continua buscando mesmo quando uma página automática não contribui nenhum item visível', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cameras) })
          if (url.startsWith('/api/content-days'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ days: [] }),
            })
          if (url.startsWith('/api/moments')) {
            const page = new URL(url, 'http://x').searchParams.get('page')
            // página 1: 1 momento disponível — exibido=1, ímpar (carga inicial, sem auto-continuação).
            if (page === '1')
              return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ moments: [momentAt(0)], total: 4, hasMore: true }),
              })
            // página 2 (clique manual): 2 momentos, mas SEM gravação disponível — com o
            // filtro "Só com gravação" ativo, contribuem 0 itens EXIBIDOS (moments.length
            // bruto cresce de 1→3, mas displayedMoments.length continua em 1, ímpar).
            if (page === '2')
              return Promise.resolve({
                ok: true,
                status: 200,
                json: () =>
                  Promise.resolve({
                    moments: [
                      momentAt(1, { recording_available: false }),
                      momentAt(2, { recording_available: false }),
                    ],
                    total: 4,
                    hasMore: true,
                  }),
              })
            // página 3 (auto, sem novo clique — só acontece se o efeito não travou
            // depois da página 2 sem itens visíveis): 1 momento disponível — exibido
            // vira 2, fecha a linha de 2 colunas. Para aqui.
            if (page === '3')
              return Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({ moments: [momentAt(3)], total: 4, hasMore: true }),
              })
            throw new Error(`página inesperada buscada automaticamente: ${page}`)
          }
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
        }),
      )
      renderRecordings()
      await waitFor(() => expect(document.getElementById('moment-0')).not.toBeNull())

      fireEvent.click(document.getElementById('recordings-recording-only')!)
      await waitFor(() => expect(document.getElementById('moment-0')).not.toBeNull())

      fireEvent.click(document.getElementById('recordings-load-more')!)

      // só passa se a busca automática ATRAVESSAR a página 2 (0 itens visíveis) até
      // chegar na página 3 — se o efeito travar por depender da contagem EXIBIDA em vez
      // da bruta, este momento nunca aparece e o teste expira em timeout. Timeout maior
      // que o default pelo mesmo motivo do teste anterior (cadeia de 2 idas-e-voltas).
      await waitFor(
        () => {
          const cards = Array.from(document.querySelectorAll('#recordings-grid button'))
          expect(cards.length).toBe(2)
        },
        { timeout: 5000 },
      )
      // timeout do teste maior que o default (5000ms) — mesmo motivo do teste anterior.
    }, 10000)

    it('respeita um teto de páginas extras por clique, mesmo se a linha nunca fechar (evita loop sem fim)', async () => {
      const requestedPages: string[] = []
      vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
          if (url.startsWith('/api/cameras'))
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cameras) })
          if (url.startsWith('/api/content-days'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ days: [] }),
            })
          if (url.startsWith('/api/moments')) {
            const page = Number(new URL(url, 'http://x').searchParams.get('page') ?? '1')
            requestedPages.push(String(page))
            // página 1 (inicial): 1 momento — total ímpar (1), não fecha a linha de 2 colunas
            // (mas a carga inicial nunca auto-continua sozinha, então isso não importa ainda).
            // página 2 (clique manual) em diante: +2 momentos cada — a contagem total
            // permanece SEMPRE ímpar (1, 3, 5, 7, ...), nunca fechando um múltiplo de 2 —
            // só o teto de segurança (GRID_ROW_FILL_MAX_EXTRA_PAGES=5) pode parar isso.
            const count = page === 1 ? 1 : 2
            const startIndex = page === 1 ? 0 : 1 + (page - 2) * 2
            const pageMoments = Array.from({ length: count }, (_, i) => momentAt(startIndex + i))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ moments: pageMoments, total: 999, hasMore: true }),
            })
          }
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
        }),
      )
      renderRecordings()
      await waitFor(() => expect(document.getElementById('moment-0')).not.toBeNull())

      fireEvent.click(document.getElementById('recordings-load-more')!)

      // teto = 5 páginas extras automáticas além do clique manual (página 2) + a página
      // inicial (página 1) = 7 páginas buscadas no total, nunca mais que isso. Timeout
      // maior que o default: esta é a cadeia mais longa da suíte (6 idas-e-voltas
      // fetch→effect→setPage) — achado real de flakiness em code review (3/5 falhas
      // reproduzidas em bash scripts/check.sh sob contenção de CPU com o default de 1000ms).
      await waitFor(() => expect(requestedPages).toEqual(['1', '2', '3', '4', '5', '6', '7']), {
        timeout: 8000,
      })
      // confirma que realmente parou: nenhuma página 8 é buscada depois que o teto bate.
      await waitFor(() => expect(document.getElementById(`moment-${1 + 2 * 6 - 1}`)).not.toBeNull())
      expect(requestedPages).toEqual(['1', '2', '3', '4', '5', '6', '7'])
      // timeout do teste (não só do waitFor interno) maior que o default do Vitest
      // (5000ms) — é a cadeia mais longa da suíte (6 idas-e-voltas fetch→effect→
      // setPage); o testTimeout global matava o teste ANTES do waitFor interno
      // (8000ms) ter qualquer chance de resolver sob contenção de CPU.
    }, 15000)
  })

  describe('CA4: contador da quantidade exibida, respeitando os filtros ativos', () => {
    it('aba Momentos: mostra a quantidade de momentos exibidos (plural)', async () => {
      renderRecordings()
      await waitFor(() => expect(document.getElementById('recordings-count')).not.toBeNull())
      expect(document.getElementById('recordings-count')?.textContent).toBe('2 momentos')
    })

    it('aba Momentos: singular quando só 1 item exibido', async () => {
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
              json: () => Promise.resolve({ moments: [moments[0]], total: 1, hasMore: false }),
            })
          return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
        }),
      )
      renderRecordings()
      await waitFor(() => expect(document.getElementById('recordings-count')).not.toBeNull())
      expect(document.getElementById('recordings-count')?.textContent).toBe('1 momento')
    })

    it('aba Momentos: com "Só com gravação" ativo, conta só os itens exibidos (filtrados), não o bruto', async () => {
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
                Promise.resolve({
                  moments: [
                    { ...moments[0], recording_available: true },
                    { ...moments[1], recording_available: false },
                  ],
                  total: 2,
                  hasMore: false,
                }),
            })
          return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
        }),
      )
      renderRecordings()
      await waitFor(() =>
        expect(document.getElementById('recordings-count')?.textContent).toBe('2 momentos'),
      )
      fireEvent.click(document.getElementById('recordings-recording-only')!)
      await waitFor(() =>
        expect(document.getElementById('recordings-count')?.textContent).toBe('1 momento'),
      )
    })

    it('aba Gravações: mostra a quantidade de gravações exibidas', async () => {
      renderRecordings()
      await switchToRecordings()
      await waitFor(() => expect(document.getElementById('recordings-count')).not.toBeNull())
      expect(document.getElementById('recordings-count')?.textContent).toBe('2 gravações')
    })
  })
})
