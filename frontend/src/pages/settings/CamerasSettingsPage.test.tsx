import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CamerasSettingsPage from './CamerasSettingsPage'
import { getRole } from '../../auth'

afterEach(() => {
  cleanup()
  vi.mocked(getRole).mockReturnValue('admin')
})

const mockFetch = vi.fn()
global.fetch = mockFetch

vi.mock('../../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  authHeaders: () => ({}),
  getToken: () => 'fake',
  onUnauthorized: vi.fn(),
  clearToken: vi.fn(),
}))

vi.mock('../../components/SettingsLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}))

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/settings/cameras']}>
      <Routes>
        <Route path="/settings/cameras" element={<CamerasSettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CA5: CamerasSettingsPage (admin) — Card com badges e ações com texto', () => {
  it('exibe cada câmera em Card com badges Detecção/Gravando/Análise de objetos e botões Configurar/Excluir com texto', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'cam1',
          name: 'Corredor de Entrada',
          recording_enabled: true,
          motion: { enabled: true },
          analysis_enabled: true,
        },
        {
          id: 'cam2',
          name: 'Quintal',
          recording_enabled: false,
          motion: null,
          analysis_enabled: false,
        },
      ],
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('Corredor de Entrada')).toBeTruthy())

    // cam1: os 3 badges positivos, cada um com uma cor (variante) distinta.
    expect(screen.getByText('Detecção').className).toContain('green')
    expect(screen.getByText('Gravando').className).toContain('red')
    expect(screen.getByText('Análise de objetos').className).toContain('blue')

    // cam2: nenhum badge (motion desabilitado, não grava, sem análise).
    expect(screen.getByText('Quintal')).toBeTruthy()

    // ações com texto visível (não só ícone) — um Configurar/Excluir por câmera.
    const configureLinks = screen.getAllByRole('link', { name: /Configurar/i })
    const deleteButtons = screen.getAllByRole('button', { name: /Excluir/i })
    expect(configureLinks).toHaveLength(2)
    expect(deleteButtons).toHaveLength(2)
    // desde refactor/camera-detail-secoes-aplicar (T4): sem rota de edição
    // própria — a página de detalhe já mostra tudo editável.
    expect(configureLinks[0].getAttribute('href')).toBe('/settings/cameras/cam1')
  })

  it('CA5: sem nenhum badge quando motion/gravação/análise estão desabilitados', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: 'cam2', name: 'Quintal', recording_enabled: false, motion: null }],
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('Quintal')).toBeTruthy())
    expect(screen.queryByText('Detecção')).toBeNull()
    expect(screen.queryByText('Gravando')).toBeNull()
    expect(screen.queryByText('Análise de objetos')).toBeNull()
    // rótulos antigos não devem mais existir.
    expect(screen.queryByText('motion')).toBeNull()
    expect(screen.queryByText('rec off')).toBeNull()
  })
})

describe('CA2: botão "Nova câmera" navega de verdade pra /settings/cameras/new; lista some nessa rota', () => {
  function renderWithNewRoute() {
    return render(
      <MemoryRouter initialEntries={['/settings/cameras']}>
        <Routes>
          <Route path="/settings/cameras" element={<CamerasSettingsPage />} />
          <Route path="/settings/cameras/new" element={<CamerasSettingsPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('clicar em "Nova câmera" muda a URL pra /settings/cameras/new (navegação real, não só estado local)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: 'cam1', name: 'Corredor', recording_enabled: true, motion: null }],
    })
    renderWithNewRoute()

    await waitFor(() => expect(screen.getByText('Corredor')).toBeTruthy())
    fireEvent.click(document.getElementById('camera-create')!)

    await waitFor(() => {
      expect(document.getElementById('camera-form-name')).toBeTruthy()
    })
    // "Nova câmera" é subtítulo da página (PageHeader), não texto solto dentro da sessão.
    expect(screen.getByText('Nova câmera')).toBeTruthy()
  })

  it('em /settings/cameras/new, a lista de câmeras já cadastradas não aparece', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: 'cam1', name: 'Corredor', recording_enabled: true, motion: null }],
    })
    render(
      <MemoryRouter initialEntries={['/settings/cameras/new']}>
        <Routes>
          <Route path="/settings/cameras/new" element={<CamerasSettingsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.getElementById('camera-form-name')).toBeTruthy()
    })
    expect(screen.queryByText('Corredor')).toBeNull()
  })
})

describe('CA2: lista de câmeras (admin) usa CameraCard em grade lado a lado, mesmo chrome de ExtensionCard', () => {
  it('cada câmera aparece num card (rounded-xl) dentro de uma grade que quebra linha, não empilhada verticalmente', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'cam1',
          name: 'Corredor',
          recording_enabled: true,
          motion: { enabled: true },
          analysis_enabled: false,
        },
      ],
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('Corredor')).toBeTruthy())

    const card = document.getElementById('camera-card-cam1')
    expect(card).toBeTruthy()
    expect(card!.className).toContain('rounded-xl')

    const grid = document.getElementById('cameras-grid')
    expect(grid).toBeTruthy()
    expect(grid!.className).toContain('flex-row')
    expect(grid!.className).toContain('flex-wrap')
  })
})

describe('CA3: lista de câmeras (viewer) também usa CameraCard em grade, sem ações de admin', () => {
  it('viewer vê thumbnail/nome/badges no card, mas sem os botões Configurar/Excluir', async () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'cam1',
          name: 'Quintal',
          recording_enabled: false,
          motion: null,
          analysis_enabled: false,
        },
      ],
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('Quintal')).toBeTruthy())

    const grid = document.getElementById('cameras-grid')
    expect(grid).toBeTruthy()
    expect(grid!.className).toContain('flex-wrap')

    expect(screen.queryByRole('button', { name: /Excluir/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /Configurar/i })).toBeNull()
  })
})

describe('CA4: drag-and-drop de reordenação continua funcional na grade (admin)', () => {
  it('arrastar um card sobre outro chama PUT /api/settings/cameras/reorder com a nova ordem', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'cam1',
          name: 'Primeira',
          recording_enabled: false,
          motion: null,
          analysis_enabled: false,
        },
        {
          id: 'cam2',
          name: 'Segunda',
          recording_enabled: false,
          motion: null,
          analysis_enabled: false,
        },
      ],
    })

    renderPage()
    await waitFor(() => expect(screen.getByText('Primeira')).toBeTruthy())

    const card1 = document.getElementById('camera-card-cam1')!
    const card2 = document.getElementById('camera-card-cam2')!
    expect(card1).toBeTruthy()
    expect(card2).toBeTruthy()

    fireEvent.dragStart(card1)
    fireEvent.dragOver(card2)
    fireEvent.drop(card2)

    await waitFor(() => {
      const reorderCall = mockFetch.mock.calls.find(
        ([url]) => url === '/api/settings/cameras/reorder',
      )
      expect(reorderCall).toBeTruthy()
    })
    const reorderCall = mockFetch.mock.calls.find(
      ([url]) => url === '/api/settings/cameras/reorder',
    )!
    const body = JSON.parse((reorderCall[1] as RequestInit).body as string)
    expect(body.ids).toEqual(['cam2', 'cam1'])
  })
})
