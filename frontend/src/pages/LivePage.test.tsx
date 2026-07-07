import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: () => 'admin',
  getUsername: () => 'jackson',
  clearToken: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

// Player faz negociação WebRTC/HLS no mount — stub para inspecionar as props.
vi.mock('../components/Player', () => ({
  default: (props: { src?: string; cameraId?: string; transport?: string }) => (
    <div
      data-testid="hls"
      data-src={props.src}
      data-camera={props.cameraId}
      data-transport={props.transport}
    />
  ),
}))

import LivePage from './LivePage'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/live/:cameraId" element={<LivePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const cameras = [{ id: 'cam1', name: 'Entrada', live_transport: 'auto', recording_enabled: true }]

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/cameras')) {
        return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
      }
      return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('LivePage', () => {
  it('header com nome da câmera, tab "Ao vivo" ativa (dot maior/pulsante) e player (HLSPlayer com src correto)', async () => {
    renderAt('/live/cam1')
    await waitFor(() => {
      expect(document.getElementById('live-header')?.textContent).toContain('Entrada')
    })
    // Tabs no header: "Ao vivo" ativa, "Histórico" → /history/{id}. O status "ao vivo" é
    // sinalizado pelo dot da própria aba — sem badge redundante no header.
    expect(document.getElementById('camera-tab-live')?.getAttribute('aria-current')).toBe('page')
    expect(document.getElementById('camera-tab-history')?.getAttribute('href')).toBe('/history/cam1')
    expect(document.getElementById('live-header')?.textContent).not.toContain('AO VIVO')
    expect(document.getElementById('live-badge-live')).toBeNull()
    const dot = document.getElementById('camera-tab-live-dot')!
    expect(dot.className).toContain('animate-pulse')
    expect(dot.className).toContain('h-2.5 w-2.5')
    const player = document.getElementById('live-player')!
    expect(player.hasAttribute('data-on-video')).toBe(true)
    const hls = screen.getByTestId('hls')
    expect(hls.getAttribute('data-src')).toBe('/stream/cam1/index.m3u8')
    expect(hls.getAttribute('data-camera')).toBe('cam1')
    expect(hls.getAttribute('data-transport')).toBe('auto')
  })

  it('mostra o badge "REC" quando recording_enabled é true', async () => {
    renderAt('/live/cam1')
    await waitFor(() => {
      expect(document.getElementById('live-header')?.textContent).toContain('Entrada')
    })
    expect(document.getElementById('live-header')?.textContent).toContain('REC')
  })

  it('esconde o badge "REC" quando recording_enabled é false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/cameras')) {
          return Promise.resolve({
            status: 200,
            json: () => Promise.resolve([{ id: 'cam1', name: 'Entrada', live_transport: 'auto', recording_enabled: false }]),
          })
        }
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
    renderAt('/live/cam1')
    await waitFor(() => {
      expect(document.getElementById('live-header')?.textContent).toContain('Entrada')
    })
    expect(document.getElementById('live-header')?.textContent).not.toContain('REC')
  })

  it('badge REC usa formato de badge discreto (borda âmbar, dot pulsante)', async () => {
    renderAt('/live/cam1')
    await waitFor(() => {
      expect(document.getElementById('live-badge-recording')).not.toBeNull()
    })
    const recording = document.getElementById('live-badge-recording')!
    expect(recording.className).toContain('bg-foreground/5')
    expect(recording.className).toContain('border-recording/20')
    expect(recording.className).toContain('rounded-md')
    expect(recording.querySelector('span')?.className).toContain('animate-pulse')
  })

  it('sem botão de tela cheia no cabeçalho — o Player tem o próprio (canto)', async () => {
    renderAt('/live/cam1')
    await waitFor(() => {
      expect(document.getElementById('live-header')?.textContent).toContain('Entrada')
    })
    expect(document.getElementById('live-fullscreen-toggle')).toBeNull()
  })

  it('câmera inexistente → bloco de erro #live-error, sem player', async () => {
    renderAt('/live/desconhecida')
    const err = await waitFor(() => {
      const el = document.getElementById('live-error')
      if (!el) throw new Error('erro não renderizou')
      return el
    })
    expect(err.className).toContain('border-danger/40')
    expect(err.textContent).toContain('não encontrada')
    expect(screen.queryByTestId('hls')).toBeNull()
  })
})
