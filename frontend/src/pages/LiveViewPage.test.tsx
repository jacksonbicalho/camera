import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
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
    cameraId?: string
    title?: string
    controls?: boolean
    children?: import('react').ReactNode
    footerTrailing?: import('react').ReactNode
  }) => (
    <div data-testid={`player-${props.cameraId}`} data-controls={props.controls ? 'true' : 'false'}>
      {props.title}
      {props.children}
      {props.footerTrailing}
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
    isDraggable?: boolean
    isResizable?: boolean
    onLayoutChange?: (l: unknown) => void
  } | null,
}))
vi.mock('react-grid-layout/legacy', () => ({
  default: (props: {
    layout?: unknown
    cols?: number
    rowHeight?: number
    isDraggable?: boolean
    isResizable?: boolean
    onLayoutChange?: (l: unknown) => void
    children?: import('react').ReactNode
  }) => {
    gridLayoutMock.lastProps = props
    return <div id="live-view-grid-mock">{props.children}</div>
  },
  WidthProvider: (C: unknown) => C,
}))

import { getRole } from '../auth'
import LiveViewPage from './LiveViewPage'

const cameras = [
  { id: 'cam1', name: 'Corredor' },
  { id: 'cam2', name: 'Quintal' },
]

function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LiveViewPage />
      <LocationProbe />
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
  vi.mocked(getRole).mockReturnValue('admin')
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

describe('CA5: presets de layout (1×1/2×2/3×3/4×4) num dropdown (mesmo padrão do "color-mode")', () => {
  it('gatilho mostra o preset atual; abrir o dropdown mostra as 4 opções', async () => {
    renderPage()
    await waitFor(() => {
      expect(document.getElementById('live-view-preset-trigger')?.textContent).toContain('3×3')
    })
    fireEvent.click(document.getElementById('live-view-preset-trigger')!)
    await waitFor(() => {
      expect(document.getElementById('live-view-preset-1x1')).not.toBeNull()
      expect(document.getElementById('live-view-preset-2x2')).not.toBeNull()
      expect(document.getElementById('live-view-preset-3x3')).not.toBeNull()
      expect(document.getElementById('live-view-preset-4x4')).not.toBeNull()
    })
  })

  it('escolher um preset no dropdown reseta o layout, persiste cols e fecha o menu', async () => {
    renderPage()
    await waitFor(() => expect(document.getElementById('live-view-preset-trigger')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-preset-trigger')!)
    await waitFor(() => expect(document.getElementById('live-view-preset-2x2')).not.toBeNull())
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
    expect(document.getElementById('live-view-preset-menu')).toBeNull()
    expect(document.getElementById('live-view-preset-trigger')?.textContent).toContain('2×2')
  })

  it('opção ativa marcada com aria-current; trocar de preset move a marcação', async () => {
    renderPage()
    await waitFor(() => expect(document.getElementById('live-view-preset-trigger')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-preset-trigger')!)
    fireEvent.click(document.getElementById('live-view-preset-2x2')!)
    await waitFor(() => expect(gridLayoutMock.lastProps?.cols).toBe(2))

    fireEvent.click(document.getElementById('live-view-preset-trigger')!)
    await waitFor(() => {
      expect(document.getElementById('live-view-preset-2x2')?.getAttribute('aria-current')).toBe(
        'true',
      )
      expect(
        document.getElementById('live-view-preset-4x4')?.getAttribute('aria-current'),
      ).toBeNull()
    })
  })

  it('com um preset salvo (cols), a página abre já usando esse nº de colunas', async () => {
    localStorage.setItem('liveview-cols', '4')
    renderPage()
    await waitFor(() => {
      expect(gridLayoutMock.lastProps?.cols).toBe(4)
      expect(document.getElementById('live-view-preset-trigger')?.textContent).toContain('4×4')
    })
  })
})

describe('CA6: grade NxN dimensionada pela viewport (não pela largura)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 200,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rowHeight vem da altura disponível (viewport - topo do grid), não da largura', async () => {
    renderPage()
    await waitFor(() => {
      expect(gridLayoutMock.lastProps?.rowHeight).toBe((800 - 200 - 16) / 3)
    })
  })
})

describe('CA7: aplicar preset não ressuscita uma câmera explicitamente removida', () => {
  it('remover cam1 e depois clicar num preset (2x2) mantém cam1 fora da grade', async () => {
    renderPage()
    await waitFor(() => expect(document.getElementById('live-view-edit-toggle')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-edit-toggle')!)
    await waitFor(() => expect(document.getElementById('live-view-remove-cam1')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-remove-cam1')!)
    await waitFor(() => expect(document.getElementById('confirm-dialog-confirm')).not.toBeNull())
    fireEvent.click(document.getElementById('confirm-dialog-confirm')!)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="player-cam1"]')).toBeNull()
    })

    fireEvent.click(document.getElementById('live-view-preset-trigger')!)
    await waitFor(() => expect(document.getElementById('live-view-preset-2x2')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-preset-2x2')!)
    await waitFor(() => {
      expect(gridLayoutMock.lastProps?.cols).toBe(2)
    })
    expect(document.querySelector('[data-testid="player-cam1"]')).toBeNull()
    expect(document.querySelector('[data-testid="player-cam2"]')).not.toBeNull()
    expect(
      (JSON.parse(localStorage.getItem('liveview-layout')!) as { i: string }[]).map((t) => t.i),
    ).toEqual(['cam2'])
  })
})

describe('CA7: botão "Editar grid" esclarece a ação de aplicar ao ficar ativo', () => {
  it('fora do modo de edição mostra "Editar grid"; ativo, mostra "Aplicar alterações"', async () => {
    renderPage()
    await waitFor(() => expect(document.getElementById('live-view-edit-toggle')).not.toBeNull())
    expect(document.getElementById('live-view-edit-toggle')?.textContent).toContain('Editar grid')
    fireEvent.click(document.getElementById('live-view-edit-toggle')!)
    await waitFor(() => {
      expect(document.getElementById('live-view-edit-toggle')?.textContent).toContain(
        'Aplicar alterações',
      )
    })
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

describe('CA7: modo de edição trava/destrava a grade; sem ele, sem botão de remover à mostra', () => {
  it('fora do modo de edição, grade travada e sem botão de remover em nenhum tile', async () => {
    renderPage()
    await waitFor(() => {
      expect(gridLayoutMock.lastProps?.isDraggable).toBe(false)
      expect(gridLayoutMock.lastProps?.isResizable).toBe(false)
    })
    expect(document.getElementById('live-view-remove-cam1')).toBeNull()
    expect(document.getElementById('live-view-insert-camera')).toBeNull()
  })

  it('ativar "Editar grid" destrava a grade e mostra o botão de remover em cada tile', async () => {
    renderPage()
    await waitFor(() => {
      expect(document.getElementById('live-view-edit-toggle')).not.toBeNull()
    })
    fireEvent.click(document.getElementById('live-view-edit-toggle')!)
    await waitFor(() => {
      expect(gridLayoutMock.lastProps?.isDraggable).toBe(true)
      expect(gridLayoutMock.lastProps?.isResizable).toBe(true)
    })
    expect(document.getElementById('live-view-remove-cam1')).not.toBeNull()
    expect(document.getElementById('live-view-insert-camera')).not.toBeNull()
  })
})

describe('CA7: remover câmera desta tela (via ConfirmDialog) não afeta o sistema', () => {
  it('clicar em remover abre ConfirmDialog com o nome da câmera; cancelar mantém o tile', async () => {
    renderPage()
    await waitFor(() => expect(document.getElementById('live-view-edit-toggle')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-edit-toggle')!)
    await waitFor(() => expect(document.getElementById('live-view-remove-cam1')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-remove-cam1')!)
    await waitFor(() => {
      expect(document.body.textContent).toContain('Corredor')
      expect(document.body.textContent).toContain('continua funcionando normalmente no sistema')
    })
    fireEvent.click(document.getElementById('confirm-dialog-cancel')!)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="player-cam1"]')).not.toBeNull()
    })
  })

  it('confirmar remove o tile da grade, persiste o layout e marca a câmera como oculta', async () => {
    renderPage()
    await waitFor(() => expect(document.getElementById('live-view-edit-toggle')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-edit-toggle')!)
    await waitFor(() => expect(document.getElementById('live-view-remove-cam1')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-remove-cam1')!)
    await waitFor(() => expect(document.getElementById('confirm-dialog-confirm')).not.toBeNull())
    fireEvent.click(document.getElementById('confirm-dialog-confirm')!)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="player-cam1"]')).toBeNull()
      expect(document.querySelector('[data-testid="player-cam2"]')).not.toBeNull()
    })
    expect(JSON.parse(localStorage.getItem('liveview-hidden')!)).toEqual(['cam1'])
    expect(
      (JSON.parse(localStorage.getItem('liveview-layout')!) as { i: string }[]).map((t) => t.i),
    ).toEqual(['cam2'])
  })
})

describe('CA7: inserir câmera (picker) reabre uma câmera removida na grade', () => {
  it('botão "Inserir câmera" fica desabilitado quando todas as câmeras já estão na grade', async () => {
    renderPage()
    await waitFor(() => expect(document.getElementById('live-view-edit-toggle')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-edit-toggle')!)
    await waitFor(() => {
      expect(document.getElementById('live-view-insert-camera')).toHaveProperty('disabled', true)
    })
  })

  it('remover uma câmera habilita "Inserir câmera"; escolhê-la de volta reaparece na grade', async () => {
    renderPage()
    await waitFor(() => expect(document.getElementById('live-view-edit-toggle')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-edit-toggle')!)
    await waitFor(() => expect(document.getElementById('live-view-remove-cam1')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-remove-cam1')!)
    await waitFor(() => expect(document.getElementById('confirm-dialog-confirm')).not.toBeNull())
    fireEvent.click(document.getElementById('confirm-dialog-confirm')!)

    await waitFor(() => {
      expect(document.getElementById('live-view-insert-camera')).toHaveProperty('disabled', false)
    })
    fireEvent.click(document.getElementById('live-view-insert-camera')!)
    await waitFor(() =>
      expect(document.getElementById('live-view-insert-camera-cam1')).not.toBeNull(),
    )
    fireEvent.click(document.getElementById('live-view-insert-camera-cam1')!)

    await waitFor(() => {
      expect(document.querySelector('[data-testid="player-cam1"]')).not.toBeNull()
    })
    expect(JSON.parse(localStorage.getItem('liveview-hidden')!)).toEqual([])
  })

  it('clicar fora do menu "Inserir câmera" o fecha (mesmo padrão do dropdown de presets)', async () => {
    renderPage()
    await waitFor(() => expect(document.getElementById('live-view-edit-toggle')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-edit-toggle')!)
    await waitFor(() => expect(document.getElementById('live-view-remove-cam1')).not.toBeNull())
    fireEvent.click(document.getElementById('live-view-remove-cam1')!)
    await waitFor(() => expect(document.getElementById('confirm-dialog-confirm')).not.toBeNull())
    fireEvent.click(document.getElementById('confirm-dialog-confirm')!)
    await waitFor(() => {
      expect(document.getElementById('live-view-insert-camera')).toHaveProperty('disabled', false)
    })
    fireEvent.click(document.getElementById('live-view-insert-camera')!)
    await waitFor(() =>
      expect(document.getElementById('live-view-insert-camera-menu')).not.toBeNull(),
    )
    fireEvent.mouseDown(document.body)
    await waitFor(() => {
      expect(document.getElementById('live-view-insert-camera-menu')).toBeNull()
    })
  })
})

describe('CA7: reconciliação não traz de volta uma câmera explicitamente removida', () => {
  it('câmera marcada como oculta (localStorage) não reaparece sozinha ao recarregar a página', async () => {
    localStorage.setItem('liveview-layout', JSON.stringify([{ i: 'cam1', x: 0, y: 0, w: 1, h: 1 }]))
    localStorage.setItem('liveview-hidden', JSON.stringify(['cam2']))
    renderPage()
    await waitFor(() => {
      expect(document.querySelector('[data-testid="player-cam1"]')).not.toBeNull()
    })
    expect(document.querySelector('[data-testid="player-cam2"]')).toBeNull()
  })
})

describe('CA8: onboarding (migrado da extinta AllCamerasPage) — LiveViewPage agora é a página principal (/)', () => {
  function stubEmptyCameras() {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/cameras'))
          return Promise.resolve({ status: 200, json: () => Promise.resolve([]) })
        return Promise.resolve({ status: 404, json: () => Promise.resolve({}) })
      }),
    )
  }

  it('sem câmeras cadastradas e usuário admin, redireciona pra /settings/cameras/new', async () => {
    stubEmptyCameras()
    renderPage()
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/settings/cameras/new')
    })
  })

  it('sem câmeras cadastradas e usuário não-admin, mostra mensagem vazia sem redirecionar', async () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    stubEmptyCameras()
    renderPage()
    await waitFor(() => {
      expect(document.getElementById('live-view-empty')).not.toBeNull()
    })
    expect(document.getElementById('test-location')!.textContent).toBe('/')
  })
})
