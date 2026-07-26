import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
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
  default: (props: {
    cameraId?: string
    title?: string
    controls?: boolean
    children?: import('react').ReactNode
  }) => (
    <div data-testid={`player-${props.cameraId}`} data-controls={props.controls ? 'true' : 'false'}>
      {props.title}
      {props.children}
    </div>
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
  lastProps: null as {
    layout?: unknown
    cols?: number
    rowHeight?: number
    onLayoutChange?: (l: unknown) => void
  } | null,
}))
vi.mock('react-grid-layout/legacy', () => ({
  default: (props: {
    layout?: unknown
    cols?: number
    rowHeight?: number
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
      expect(document.querySelector('[data-testid="player-cam1"]')?.textContent).toContain(
        'Corredor',
      )
      expect(document.querySelector('[data-testid="player-cam2"]')?.textContent).toContain(
        'Quintal',
      )
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

describe('CA5: presets de layout (1×1/2×2/3×3/4×4) resetam o arranjo e persistem o preset escolhido', () => {
  it('mostra os 4 botões de preset', async () => {
    renderPage()
    await waitFor(() => {
      expect(document.getElementById('live-view-preset-1x1')).not.toBeNull()
      expect(document.getElementById('live-view-preset-2x2')).not.toBeNull()
      expect(document.getElementById('live-view-preset-3x3')).not.toBeNull()
      expect(document.getElementById('live-view-preset-4x4')).not.toBeNull()
    })
  })

  it('clicar num preset reseta o layout pra 1 célula por câmera com esse nº de colunas, e persiste cols', async () => {
    renderPage()
    await waitFor(() => {
      expect(document.getElementById('live-view-preset-2x2')).not.toBeNull()
    })
    fireEvent.click(document.getElementById('live-view-preset-2x2')!)
    await waitFor(() => {
      expect(gridLayoutMock.lastProps?.layout).toEqual([
        { i: 'cam1', x: 0, y: 0, w: 1, h: 1 },
        { i: 'cam2', x: 1, y: 0, w: 1, h: 1 },
      ])
      expect(gridLayoutMock.lastProps?.cols).toBe(2)
    })
    expect(localStorage.getItem('liveview-cols')).toBe('2')
    expect(JSON.parse(localStorage.getItem('liveview-layout')!)).toEqual([
      { i: 'cam1', x: 0, y: 0, w: 1, h: 1 },
      { i: 'cam2', x: 1, y: 0, w: 1, h: 1 },
    ])
  })

  it('preset ativo fica destacado visualmente; trocar de preset move o destaque', async () => {
    renderPage()
    await waitFor(() => {
      expect(document.getElementById('live-view-preset-2x2')).not.toBeNull()
    })
    fireEvent.click(document.getElementById('live-view-preset-2x2')!)
    await waitFor(() => {
      expect(document.getElementById('live-view-preset-2x2')?.className).toContain('bg-primary')
    })
    expect(document.getElementById('live-view-preset-3x3')?.className).not.toContain('bg-primary')

    fireEvent.click(document.getElementById('live-view-preset-4x4')!)
    await waitFor(() => {
      expect(document.getElementById('live-view-preset-4x4')?.className).toContain('bg-primary')
    })
    expect(document.getElementById('live-view-preset-2x2')?.className).not.toContain('bg-primary')
  })

  it('com um preset salvo (cols), a página abre já usando esse nº de colunas', async () => {
    localStorage.setItem('liveview-cols', '4')
    renderPage()
    await waitFor(() => {
      expect(gridLayoutMock.lastProps?.cols).toBe(4)
    })
    expect(document.getElementById('live-view-preset-4x4')?.className).toContain('bg-primary')
  })
})

describe('CA5: Player de cada tile tem controles + badge "AO VIVO" (paridade com AllCamerasPage)', () => {
  it('cada Player recebe controls=true', async () => {
    renderPage()
    await waitFor(() => {
      expect(
        document.querySelector('[data-testid="player-cam1"]')?.getAttribute('data-controls'),
      ).toBe('true')
    })
  })

  it('cada tile mostra o badge "AO VIVO"', async () => {
    renderPage()
    await waitFor(() => {
      expect(document.querySelector('[data-testid="player-cam1"]')?.textContent).toContain(
        'AO VIVO',
      )
    })
  })
})
