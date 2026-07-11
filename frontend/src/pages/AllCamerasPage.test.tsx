import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryRouter, useLocation } from 'react-router-dom'

vi.mock('../auth', () => ({
  authHeaders: () => ({}),
  onUnauthorized: vi.fn(),
  getRole: vi.fn(() => 'admin'),
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

vi.mock('../components/Player', () => ({
  default: (props: {
    id?: string
    src?: string
    cameraId?: string
    transport?: string
    title?: string
    controls?: boolean
    children?: import('react').ReactNode
  }) => (
    <div
      data-testid={`player-${props.cameraId}`}
      data-id={props.id}
      data-src={props.src}
      data-transport={props.transport}
      data-title={props.title}
      data-controls={props.controls ? 'true' : 'false'}
    >
      {props.title}
      {props.children}
    </div>
  ),
}))

import { getRole } from '../auth'
import AllCamerasPage from './AllCamerasPage'

function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderAt(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AllCamerasPage />
      <LocationProbe />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(getRole).mockReturnValue('admin')
})

describe('AllCamerasPage — não usa nada do layout legado', () => {
  it('não importa AppLayout nem HLSPlayer (legados)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/AllCamerasPage.tsx'), 'utf8')
    expect(source).not.toMatch(/AppLayout/)
    expect(source).not.toMatch(/HLSPlayer/)
  })
})

describe('AllCamerasPage — grid de câmeras ao vivo', () => {
  const cameras = [
    { id: 'cam1', name: 'Corredor', live_transport: 'auto' },
    { id: 'cam2', name: 'Quintal', live_transport: 'hls' },
  ]

  it('título via PageHeader ("Todas as câmeras")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-content')).not.toBeNull()
    })
    expect(document.getElementById('all-cameras-header')?.textContent).toContain('Todas as câmeras')
  })

  it('conteúdo usa a largura toda (sem o cap de .page-content) — grid de câmeras aproveita telas largas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-content')).not.toBeNull()
    })
    const content = document.getElementById('all-cameras-content')!
    expect(content.className).not.toContain('page-content')
    expect(content.className).not.toMatch(/max-w-/)
    expect(content.className).toContain('w-full')
  })

  it('grid preenche a altura disponível via flex (não um min-height fixo em vh — fica muito vazio em telas altas)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-grid')).not.toBeNull()
    })
    const content = document.getElementById('all-cameras-content')!
    const grid = document.getElementById('all-cameras-grid')!
    expect(content.className).toContain('flex')
    expect(content.className).toContain('flex-1')
    expect(content.className).toContain('min-h-0')
    expect(content.className).toContain('flex-col')
    expect(grid.className).toContain('flex-1')
    expect(grid.className).toContain('min-h-0')
    expect(grid.className).not.toMatch(/min-h-\[/)
  })

  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 3],
    [9, 3],
    [10, 4],
  ])('divide o grid em %i câmera(s) → %i colunas', async (count, expectedCols) => {
    const many = Array.from({ length: count }, (_, i) => ({ id: `cam${i}`, name: `Cam ${i}` }))
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(many) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-grid')).not.toBeNull()
    })
    expect(document.getElementById('all-cameras-grid')!.style.gridTemplateColumns).toBe(
      `repeat(${expectedCols}, minmax(0, 1fr))`,
    )
  })

  it('renderiza um card por câmera com o player ao vivo (src/transport corretos)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-card-cam1')).not.toBeNull()
      expect(document.getElementById('all-cameras-card-cam2')).not.toBeNull()
    })
    expect(document.getElementById('all-cameras-card-cam1')?.textContent).toContain('Corredor')
    const player1 = document.querySelector('[data-testid="player-cam1"]')!
    expect(player1.getAttribute('data-src')).toBe('/stream/cam1/index.m3u8')
    expect(player1.getAttribute('data-transport')).toBe('auto')
  })

  it('hover no card não muda a cor da borda (sem hover:border-primary)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-card-cam1')).not.toBeNull()
    })
    expect(document.getElementById('all-cameras-card-cam1')?.className).not.toContain(
      'hover:border-primary',
    )
  })

  it('clicar num card navega para /live/{id} (rota nova, não mais /camera/live/:id)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-card-cam2')).not.toBeNull()
    })
    fireEvent.click(document.getElementById('all-cameras-card-cam2')!)
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/live/cam2')
    })
  })

  it('card não é mais um <button> (não pode aninhar os botões do rodapé) — usa role="button" + teclado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-card-cam2')).not.toBeNull()
    })
    const card = document.getElementById('all-cameras-card-cam2')!
    expect(card.tagName).not.toBe('BUTTON')
    expect(card.getAttribute('role')).toBe('button')
    expect(card.getAttribute('tabIndex')).toBe('0')

    fireEvent.keyDown(card, { key: 'Enter' })
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/live/cam2')
    })
  })

  it('cada card passa id único, title (nome) e controls ao Player, com o badge "AO VIVO" como children', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-card-cam1')).not.toBeNull()
    })
    const player1 = document.querySelector('[data-testid="player-cam1"]')!
    const player2 = document.querySelector('[data-testid="player-cam2"]')!
    expect(player1.getAttribute('data-id')).toBe('player-cam1')
    expect(player2.getAttribute('data-id')).toBe('player-cam2')
    expect(player1.getAttribute('data-id')).not.toBe(player2.getAttribute('data-id'))
    expect(player1.getAttribute('data-title')).toBe('Corredor')
    expect(player1.getAttribute('data-controls')).toBe('true')
    expect(player1.textContent).toContain('AO VIVO')
  })

  it('lista vazia + admin redireciona para /settings/cameras/new', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve([]) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/settings/cameras/new')
    })
  })

  it('lista vazia + viewer mostra mensagem sem redirecionar', async () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 200, json: () => Promise.resolve([]) })),
    )
    renderAt('/')
    await waitFor(() => {
      expect(document.getElementById('all-cameras-empty')).not.toBeNull()
    })
    expect(document.getElementById('test-location')!.textContent).toBe('/')
  })
})
