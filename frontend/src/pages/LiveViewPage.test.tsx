import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

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
  default: (props: { cameraId?: string; title?: string }) => (
    <div data-testid={`player-${props.cameraId}`}>{props.title}</div>
  ),
}))

// react-grid-layout/legacy (API v1 completa, ver "Migrating from v1" no README da lib —
// react-grid-layout v2 fez um rewrite, mas o subpath /legacy mantém 100% de compatibilidade
// runtime com a API clássica: default export + WidthProvider) depende de medição real de
// DOM (ResizeObserver/getBoundingClientRect), que o jsdom não faz — mock raso (mesmo
// espírito de mockar Player/DatePicker em outras páginas). Captura os props recebidos (via
// vi.hoisted) pra inspecionar `layout` e disparar `onLayoutChange` manualmente nos testes,
// sem depender de nenhuma medição real de layout.
const gridLayoutMock = vi.hoisted(() => ({
  lastProps: null as { layout?: unknown; onLayoutChange?: (l: unknown) => void } | null,
}))
vi.mock('react-grid-layout/legacy', () => ({
  default: (props: {
    layout?: unknown
    onLayoutChange?: (l: unknown) => void
    children?: import('react').ReactNode
  }) => {
    gridLayoutMock.lastProps = props
    return <div id="live-view-grid-mock">{props.children}</div>
  },
  WidthProvider: (C: unknown) => C,
}))

import LiveViewPage from './LiveViewPage'

const cameras = [
  { id: 'cam1', name: 'Corredor' },
  { id: 'cam2', name: 'Quintal' },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <LiveViewPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  gridLayoutMock.lastProps = null
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.startsWith('/api/cameras'))
        return Promise.resolve({ status: 200, json: () => Promise.resolve(cameras) })
      return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('CA3: LiveViewPage — grid customizável (react-grid-layout) das câmeras ao vivo', () => {
  it('renderiza um tile por câmera (Player com o título certo)', async () => {
    renderPage()
    await waitFor(() => {
      expect(document.querySelector('[data-testid="player-cam1"]')?.textContent).toBe('Corredor')
      expect(document.querySelector('[data-testid="player-cam2"]')?.textContent).toBe('Quintal')
    })
  })

  it('sem layout salvo, usa o arranjo automático (defaultLayout) — um item de layout por câmera', async () => {
    renderPage()
    await waitFor(() => {
      const layout = gridLayoutMock.lastProps?.layout as { i: string }[] | undefined
      expect(layout?.map((t) => t.i).sort()).toEqual(['cam1', 'cam2'])
    })
  })

  it('mudar o layout (arrastar/redimensionar) persiste em localStorage', async () => {
    renderPage()
    await waitFor(() => {
      expect(gridLayoutMock.lastProps?.onLayoutChange).toBeTruthy()
    })
    const newLayout = [
      { i: 'cam1', x: 2, y: 0, w: 6, h: 6 },
      { i: 'cam2', x: 8, y: 0, w: 4, h: 4 },
    ]
    gridLayoutMock.lastProps!.onLayoutChange!(newLayout)
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('liveview-layout')!)).toEqual(newLayout)
    })
  })

  it('com layout salvo (mesmas câmeras), usa o layout salvo em vez do automático', async () => {
    const saved = [
      { i: 'cam1', x: 3, y: 1, w: 5, h: 5 },
      { i: 'cam2', x: 8, y: 1, w: 4, h: 4 },
    ]
    localStorage.setItem('liveview-layout', JSON.stringify(saved))
    renderPage()
    await waitFor(() => {
      expect(gridLayoutMock.lastProps?.layout).toEqual(saved)
    })
  })
})
