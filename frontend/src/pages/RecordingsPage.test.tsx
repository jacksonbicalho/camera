import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import RecordingsPage from './RecordingsPage'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
}))
vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../components/DatePicker', () => ({ default: () => <div data-testid="datepicker" /> }))

const cameras = [{ id: 'cam1', name: 'Corredor' }, { id: 'cam2', name: 'Quintal' }]
const moments = [
  { camera_id: 'cam1', camera_name: 'Corredor', time: '2026-06-23T08:08:05Z', kind: 'state', label: 'aberto', category: 'estados', frame: '/recordings/state_history/1/x.jpg', score: 0.9 },
  { camera_id: 'cam2', camera_name: 'Quintal', time: '2026-06-23T07:00:00Z', kind: 'motion', label: 'pessoa', category: 'pessoa', frame: '20260623070000_motion.jpg', score: 0.5 },
]
const recordings = [
  { id: 1, camera_id: 'cam1', camera_name: 'Corredor', start: '2026-06-23T23:50:00Z', has_motion: true, url: '/recordings/cam1/2026/06/23/c.mp4' },
  { id: 2, camera_id: 'cam2', camera_name: 'Quintal', start: '2026-06-23T10:00:00Z', has_motion: false, url: '/recordings/cam2/2026/06/23/a.mp4' },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/cameras')) return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
    if (url.startsWith('/api/recordings')) return Promise.resolve({ status: 200, json: () => Promise.resolve({ recordings, total: 2 }) })
    if (url.startsWith('/api/moments')) return Promise.resolve({ status: 200, json: () => Promise.resolve({ moments, total: 2, hasMore: false }) })
    return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function LocationProbe() {
  const l = useLocation()
  return <div data-testid="loc">{l.pathname}|{JSON.stringify(l.state)}</div>
}

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
        <Route path="/cameras/:id" element={<LocationProbe />} />
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
  it('por padrão lista os momentos do dia (view ausente na URL) e clique abre a câmera no instante', async () => {
    renderRecordings()
    const card0 = await waitFor(() => {
      const el = document.getElementById('moment-0')
      if (!el) throw new Error('card não renderizou')
      return el
    })
    expect(card0.textContent).toContain('Corredor')
    expect(document.getElementById('moment-1')?.textContent).toContain('Quintal')

    fireEvent.click(card0)
    const loc = await screen.findByTestId('loc')
    expect(loc.textContent).toContain('/cameras/cam1')
    expect(loc.textContent).toContain('2026-06-23T08:08:05Z')
  })

  it('URL reflete /recordings/:date/:hour sem sufixo de view (default moments)', async () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    renderRecordings()
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe(`/recordings/${y}-${m}-${d}/24`)
    })
  })

  it('no modo Gravações (aba explícita) lista as gravações do dia, adiciona /recordings à URL e clique abre a câmera no instante', async () => {
    renderRecordings()
    await switchToRecordings()
    const rec0 = await waitFor(() => {
      const el = document.getElementById('recording-1')
      if (!el) throw new Error('gravação não renderizou')
      return el
    })
    expect(rec0.textContent).toContain('Corredor')
    expect(document.getElementById('recording-2')?.textContent).toContain('Quintal')
    expect(document.getElementById('test-location')!.textContent).toMatch(/\/recordings\/\d{4}-\d{2}-\d{2}\/24\/recordings$/)

    fireEvent.click(rec0)
    const loc = await screen.findByTestId('loc')
    expect(loc.textContent).toContain('/cameras/cam1')
    expect(loc.textContent).toContain('2026-06-23T23:50:00Z')
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
      const called = fetchMock.mock.calls.some(([u]: [string]) =>
        u.startsWith('/api/recordings') && u.includes('window=6') && u.includes('motion_only=true'),
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

    await waitFor(() => {
      const called = fetchMock.mock.calls.some(([u]: [string]) =>
        u.startsWith('/api/moments') && u.includes('q=portao') && u.includes('page=1'),
      )
      if (!called) throw new Error('fetch com q=portao não disparou')
    }, { timeout: 1500 })
  })

  it('abrir /recordings/2026-06-23/6/recordings carrega direto na aba Gravações com a data e janela da URL', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    renderRecordings('/recordings/2026-06-23/6/recordings')
    await waitFor(() => {
      expect(document.getElementById('recording-1')).toBeTruthy()
    })
    expect(document.getElementById('recordings-view-recordings')?.className).toContain('bg-primary')
    const called = fetchMock.mock.calls.some(([u]: [string]) =>
      u.startsWith('/api/recordings') && u.includes('date=2026-06-23') && u.includes('window=6'),
    )
    expect(called).toBe(true)
  })
})
