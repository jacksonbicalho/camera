import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
}))

// HLSPlayer faz negociação WebRTC/HLS no mount — stub para inspecionar as props.
vi.mock('../components/HLSPlayer', () => ({
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

const cameras = [{ id: 'cam1', name: 'Entrada', live_transport: 'auto' }]

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
  it('header com nome da câmera, indicador AO VIVO e player (HLSPlayer com src correto)', async () => {
    renderAt('/live/cam1')
    await waitFor(() => {
      expect(document.getElementById('live-header')?.textContent).toContain('Entrada')
    })
    expect(document.getElementById('live-indicator')?.textContent).toContain('AO VIVO')
    const player = document.getElementById('live-player')!
    expect(player.hasAttribute('data-on-video')).toBe(true)
    const hls = screen.getByTestId('hls')
    expect(hls.getAttribute('data-src')).toBe('/stream/cam1/index.m3u8')
    expect(hls.getAttribute('data-camera')).toBe('cam1')
    expect(hls.getAttribute('data-transport')).toBe('auto')
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
