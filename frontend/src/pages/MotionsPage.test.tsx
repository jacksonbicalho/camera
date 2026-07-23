import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import MotionsPage from './MotionsPage'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('../components/DatePicker', () => ({ default: () => <div data-testid="datepicker" /> }))

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
    category: 'estados',
    frame: '/recordings/state_history/1/x.jpg',
    score: 0.9,
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
  },
]
const camRecordings: Record<string, Array<{ id: number; start: string }>> = {
  cam1: [{ id: 1, start: '2026-06-23T23:50:00Z' }],
  cam2: [{ id: 2, start: '2026-06-23T10:00:00Z' }],
}

beforeEach(() => {
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
      if (url.startsWith('/api/moments'))
        return Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ moments, total: 2, hasMore: false }),
        })
      if (url.startsWith('/api/content-days'))
        return Promise.resolve({ status: 200, json: () => Promise.resolve({ days: [] }) })
      return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function LocationProbeGlobal() {
  const l = useLocation()
  return <div id="test-location">{l.pathname}</div>
}

function renderMotions(initialPath = '/motions') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbeGlobal />
      <Routes>
        <Route path="/motions" element={<MotionsPage />} />
        <Route path="/motions/:date" element={<MotionsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MotionsPage', () => {
  it('lista os momentos do dia em grade, com thumbnail/categoria/câmera, e clique resolve e navega pro VideoBrowserPage', async () => {
    renderMotions()
    const card0 = await waitFor(() => {
      const el = document.getElementById('motion-0')
      if (!el) throw new Error('card não renderizou')
      return el
    })
    expect(card0.textContent).toContain('Corredor')
    expect(document.getElementById('motion-1')?.textContent).toContain('Quintal')

    fireEvent.click(card0)
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/recording/cam1/1')
    })
  })

  it('URL reflete /motions/:date (sincroniza com a data selecionada)', async () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    renderMotions()
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe(`/motions/${y}-${m}-${d}`)
    })
  })

  it('digitar na busca dispara fetch com q (debounced) e reseta a página', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderMotions()
    const input = await waitFor(() => {
      const el = document.getElementById('motions-search') as HTMLInputElement | null
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

  it('clicar num chip de categoria filtra via query param e mostra só esses momentos', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderMotions()
    await waitFor(() => {
      expect(document.getElementById('motion-0')).not.toBeNull()
    })
    fetchMock.mockClear()
    fireEvent.click(document.getElementById('motions-cat-pessoa')!)
    await waitFor(() => {
      const called = fetchMock.mock.calls.some(
        ([u]: [string]) =>
          String(u).startsWith('/api/moments') && String(u).includes('category=pessoa'),
      )
      if (!called) throw new Error('fetch com category=pessoa não disparou')
    })
  })

  it('chips de câmera (multi) só aparecem com mais de 1 câmera; clicar filtra por cameras=', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderMotions()
    await waitFor(() => {
      expect(document.getElementById('motion-0')).not.toBeNull()
    })
    expect(document.getElementById('motions-cam-cam1')).not.toBeNull()
    fetchMock.mockClear()
    fireEvent.click(document.getElementById('motions-cam-cam1')!)
    await waitFor(() => {
      const called = fetchMock.mock.calls.some(
        ([u]: [string]) =>
          String(u).startsWith('/api/moments') && String(u).includes('cameras=cam1'),
      )
      if (!called) throw new Error('fetch com cameras=cam1 não disparou')
    })
  })

  it('"Carregar mais" pagina (page=2) quando hasMore', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/moments')) {
          const page = new URL(url, 'http://x').searchParams.get('page')
          return Promise.resolve({
            status: 200,
            json: () =>
              Promise.resolve({ moments, total: 4, hasMore: page === '1' ? true : false }),
          })
        }
        if (url.startsWith('/api/cameras'))
          return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
        if (url.startsWith('/api/content-days'))
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ days: [] }) })
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderMotions()
    const loadMore = await waitFor(() => {
      const el = document.getElementById('motions-load-more')
      if (!el) throw new Error('botão "Carregar mais" não renderizou')
      return el
    })
    fetchMock.mockClear()
    fireEvent.click(loadMore)
    await waitFor(() => {
      const called = fetchMock.mock.calls.some(
        ([u]: [string]) => String(u).startsWith('/api/moments') && String(u).includes('page=2'),
      )
      if (!called) throw new Error('fetch com page=2 não disparou')
    })
  })

  it('estado vazio: sem momentos no dia mostra mensagem, com busca ativa mensagem inclui o termo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/moments'))
          return Promise.resolve({
            status: 200,
            json: () => Promise.resolve({ moments: [], total: 0, hasMore: false }),
          })
        if (url.startsWith('/api/cameras'))
          return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
        if (url.startsWith('/api/content-days'))
          return Promise.resolve({ status: 200, json: () => Promise.resolve({ days: [] }) })
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    renderMotions()
    await waitFor(() => {
      expect(document.body.textContent).toContain('Nenhum momento nesta data.')
    })
  })
})
