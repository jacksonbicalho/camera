import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CamerasSettingsPage from './CamerasSettingsPage'

afterEach(cleanup)

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
  it('exibe cada câmera em Card com badges Detecção/Gravando/Análise de objetos e botões Editar/Excluir com texto', async () => {
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

    // ações com texto visível (não só ícone) — um Editar/Excluir por câmera.
    const editLinks = screen.getAllByRole('link', { name: /Editar/i })
    const deleteButtons = screen.getAllByRole('button', { name: /Excluir/i })
    expect(editLinks).toHaveLength(2)
    expect(deleteButtons).toHaveLength(2)
    expect(editLinks[0].getAttribute('href')).toBe('/settings/cameras/edit/cam1')
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
