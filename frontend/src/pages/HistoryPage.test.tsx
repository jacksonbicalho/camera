import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getToken: () => 'tok',
}))

import HistoryPage from './HistoryPage'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history/:cameraId" element={<HistoryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const cameras = [{ id: 'cam1', name: 'Corredor de entrada', recording_enabled: true }]
const recordings = [
  { id: 1, filename: 'a.mp4', start: '2026-07-05T07:12:00Z', end: '2026-07-05T07:12:42Z', url: '/recordings/cam1/a.mp4', is_recording: false, has_motion: false },
  { id: 2, filename: 'b.mp4', start: '2026-07-05T08:03:00Z', end: '2026-07-05T08:04:10Z', url: '/recordings/cam1/b.mp4', is_recording: false, has_motion: false },
]

function stubFetch(recs = recordings) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/cameras/') && url.includes('/recordings')) {
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

beforeEach(() => stubFetch())
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

  it('mesma largura de conteúdo que a LivePage (max-w-5xl)', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-content')).not.toBeNull()
    })
    expect(document.getElementById('history-content')?.className).toContain('max-w-5xl')
  })

  it('toca a gravação mais antiga do dia por padrão e lista as demais no filmstrip', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-1')).not.toBeNull()
    })
    expect(document.getElementById('history-recording-1')?.getAttribute('aria-current')).toBe('true')
    const video = document.getElementById('history-player-video') as HTMLVideoElement
    expect(video.getAttribute('src')).toBe('/recordings/cam1/a.mp4?token=tok')
    expect(document.getElementById('history-recordings')?.textContent).toContain('Gravações · 2')
  })

  it('clicar num card do filmstrip troca a gravação em reprodução', async () => {
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-recording-2')).not.toBeNull()
    })
    document.getElementById('history-recording-2')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => {
      const video = document.getElementById('history-player-video') as HTMLVideoElement
      expect(video.getAttribute('src')).toBe('/recordings/cam1/b.mp4?token=tok')
    })
    expect(document.getElementById('history-recording-2')?.getAttribute('aria-current')).toBe('true')
    expect(document.getElementById('history-recording-1')?.getAttribute('aria-current')).toBeNull()
  })

  it('sem gravações hoje → sem player nem filmstrip, mensagem de vazio', async () => {
    stubFetch([])
    renderAt('/history/cam1')
    await waitFor(() => {
      expect(document.getElementById('history-header')?.textContent).toContain('Corredor de entrada')
    })
    expect(document.getElementById('history-recordings')).toBeNull()
    expect(document.querySelector('#history-player video')).toBeNull()
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
})
