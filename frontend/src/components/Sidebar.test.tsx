import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import Sidebar from './Sidebar'
import { DisplayModeProvider } from '../contexts/DisplayModeContext'
import { clearToken, getRole } from '../auth'
import type { Notification } from '../contexts/NotificationContext'

vi.mock('../auth', () => ({
  getRole: vi.fn(() => 'admin'),
  getUsername: () => 'jackson',
  authHeaders: () => ({}),
  clearToken: vi.fn(),
}))

vi.mock('../contexts/UserNotificationContext', () => ({
  useUserNotifications: () => ({ unreadCount: 0 }),
}))

let motionNotifications: Notification[] = []
let motionUnreadCount = 0

vi.mock('../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: motionNotifications, unreadCount: motionUnreadCount,
    markRead: vi.fn(), markSelectedRead: vi.fn(),
    remove: vi.fn(), removeAll: vi.fn(), removeSelected: vi.fn(),
    browserSupported: false, browserPermission: 'default', browserEnabled: false,
    enableBrowserNotifications: vi.fn(), disableBrowserNotifications: vi.fn(),
  }),
}))

beforeEach(() => {
  localStorage.clear()
  motionNotifications = []
  motionUnreadCount = 0
})
afterEach(() => {
  cleanup()
  vi.mocked(getRole).mockReturnValue('admin')
  vi.unstubAllGlobals()
})

function LocationProbe() {
  const location = useLocation()
  return <div id="test-location">{location.pathname}</div>
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DisplayModeProvider>
        <Sidebar />
        <LocationProbe />
      </DisplayModeProvider>
    </MemoryRouter>,
  )
}

describe('Sidebar (enxuto)', () => {
  it('renderiza os itens de navegação com ids e hrefs corretos', () => {
    renderAt('/')
    const el = document.getElementById('sidebar-all-cameras')!
    expect(el).toBeTruthy()
    expect(el.getAttribute('href')).toBe('/')
    expect(el.getAttribute('aria-label')).toBeTruthy()
    expect(document.getElementById('sidebar')).toBeTruthy()
  })

  it('mostra o logo "os-camera" no topo, linkando pra "/" (mesmo padrão do sidebar legado)', () => {
    renderAt('/')
    const logo = document.getElementById('sidebar-logo')!
    expect(logo).toBeTruthy()
    expect(logo.getAttribute('href')).toBe('/')
    // recolhido por padrão: só o ícone, sem o texto
    expect(logo.textContent).not.toContain('os-camera')

    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar-logo')!.textContent).toContain('os-camera')
  })

  it('"Todas as câmeras" (antigo "Início") aponta pra "/"', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-all-cameras')?.getAttribute('aria-label')).toBe('Todas as câmeras')
  })

  it('"Todas as câmeras" (to="/") não fica ativo fora da rota exata', () => {
    renderAt('/history/cam1')
    expect(document.getElementById('sidebar-all-cameras')?.getAttribute('aria-current')).toBeNull()
  })

  it('Configurações é um botão (não link) que abre um flyout com as seções — admin vê todas', () => {
    renderAt('/')
    const btn = document.getElementById('sidebar-config')!
    expect(btn.tagName).toBe('BUTTON')
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeNull()
    fireEvent.click(btn)
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/users"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/about"]')).toBeTruthy()
  })

  it('viewer só vê as seções permitidas no flyout', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/appearance"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/about"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/users"]')).toBeNull()
    expect(document.querySelector('a[href="/settings/server"]')).toBeNull()
  })

  it('flyout fecha ao selecionar uma seção', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    const link = document.querySelector('a[href="/settings/cameras"]')!
    fireEvent.click(link)
    expect(document.querySelector('a[href="/settings/users"]')).toBeNull()
  })

  it('Configurações fica marcado ativo em qualquer rota /settings/*', () => {
    renderAt('/settings/appearance')
    expect(document.getElementById('sidebar-config')?.className).toContain('bg-primary')
  })

  it('usuário aparece no rodapé (sidebar-bottom) e abre menu com Notificações/Perfil/Sair', () => {
    renderAt('/')
    const bottom = document.getElementById('sidebar-bottom')!
    const btn = document.getElementById('sidebar-user')!
    expect(bottom.contains(btn)).toBe(true)
    expect(document.querySelector('a[href="/notifications"]')).toBeNull()
    fireEvent.click(btn)
    expect(document.querySelector('a[href="/notifications"]')).toBeTruthy()
    expect(document.querySelector('a[href="/profile"]')).toBeTruthy()
    expect(document.querySelector('a[href="/change-password"]')).toBeNull()
    expect(document.body.textContent).toContain('Sair')
  })

  it('"Sair" limpa o token', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-user')!)
    const sairBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Sair')!
    fireEvent.click(sairBtn)
    expect(clearToken).toHaveBeenCalled()
  })

  it('flyout de Configurações mostra os swatches de cor de destaque (5 opções)', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    expect(document.getElementById('accent-swatch-nav')).not.toBeNull()
    expect(document.getElementById('accent-swatch-default')).not.toBeNull()
    expect(document.getElementById('accent-swatch-violet')).not.toBeNull()
    expect(document.getElementById('accent-swatch-teal')).not.toBeNull()
    expect(document.getElementById('accent-swatch-coral')).not.toBeNull()
    expect(document.getElementById('accent-swatch-amber')).not.toBeNull()
  })

  it('recolhido por padrão (w-14, sem labels de texto) e o botão de recolher expande (w-48, com labels)', () => {
    renderAt('/')
    expect(document.getElementById('sidebar')?.className).toContain('w-14')
    expect(document.getElementById('sidebar')?.textContent).not.toContain('Todas as câmeras')

    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar')?.className).toContain('w-48')
    expect(document.getElementById('sidebar')?.textContent).toContain('Todas as câmeras')
    expect(document.getElementById('sidebar')?.textContent).toContain('Gravações')
  })

  it('clicar em recolher de novo (expandido) volta pro estado recolhido', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar')?.className).toContain('w-48')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar')?.className).toContain('w-14')
  })

  it('preferência de recolher/expandir persiste em localStorage (mesma chave do AppSidebar)', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(JSON.parse(localStorage.getItem('ui-display-mode')!).sidebar).toBe('icons-text')
  })
})

describe('Sidebar — Relatórios (flyout de câmeras)', () => {
  const cameras = [{ id: 'cam1', name: 'Corredor' }, { id: 'cam2', name: 'Quintal' }]

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(cameras),
    })))
  })

  it('é um botão (não link) com id sidebar-relatorios, sem navegar direto pra /reports', () => {
    renderAt('/')
    const btn = document.getElementById('sidebar-relatorios')!
    expect(btn.tagName).toBe('BUTTON')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ao clicar, busca /api/cameras e lista as câmeras no flyout', async () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-relatorios')!)
    await waitFor(() => {
      expect(document.getElementById('sidebar-relatorios-camera-cam1')).toBeTruthy()
      expect(document.getElementById('sidebar-relatorios-camera-cam2')).toBeTruthy()
    })
    expect(document.getElementById('sidebar-relatorios-camera-cam1')!.textContent).toContain('Corredor')
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/cameras')
  })

  it('clicar numa câmera navega para /reports/{id}/{hoje}/1 e fecha o flyout', async () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-relatorios')!)
    await waitFor(() => {
      expect(document.getElementById('sidebar-relatorios-camera-cam2')).toBeTruthy()
    })
    fireEvent.click(document.getElementById('sidebar-relatorios-camera-cam2')!)

    const today = format(new Date(), 'yyyy-MM-dd')
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe(`/reports/cam2/${today}/1`)
    })
    expect(document.getElementById('sidebar-relatorios-camera-cam2')).toBeNull()
  })

  it('marca "Relatórios" como ativo em qualquer rota /reports/*', () => {
    renderAt('/reports/cam1/2026-07-07/1')
    expect(document.getElementById('sidebar-relatorios')?.className).toContain('bg-primary')
  })
})

// "Gravações" segue o mesmo estilo de submenu de "Relatórios" (pedido do navigator:
// mesmo padrão do flyout de Configurações) — lista de câmeras, clique navega pro
// histórico da câmera (/history/:cameraId, a página nova por câmera).
describe('Sidebar — Gravações (mesmo estilo de submenu de câmeras)', () => {
  const cameras = [{ id: 'cam1', name: 'Corredor' }, { id: 'cam2', name: 'Quintal' }]

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(cameras),
    })))
  })

  it('é um botão (não link) com id sidebar-gravacoes, sem navegar direto pra /recordings', () => {
    renderAt('/')
    const btn = document.getElementById('sidebar-gravacoes')!
    expect(btn.tagName).toBe('BUTTON')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ao clicar, busca /api/cameras e lista as câmeras no flyout', async () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-gravacoes')!)
    await waitFor(() => {
      expect(document.getElementById('sidebar-gravacoes-camera-cam1')).toBeTruthy()
      expect(document.getElementById('sidebar-gravacoes-camera-cam2')).toBeTruthy()
    })
    expect(document.getElementById('sidebar-gravacoes-camera-cam1')!.textContent).toContain('Corredor')
  })

  it('clicar numa câmera navega para /history/{id} e fecha o flyout', async () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-gravacoes')!)
    await waitFor(() => {
      expect(document.getElementById('sidebar-gravacoes-camera-cam2')).toBeTruthy()
    })
    fireEvent.click(document.getElementById('sidebar-gravacoes-camera-cam2')!)

    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/history/cam2')
    })
    expect(document.getElementById('sidebar-gravacoes-camera-cam2')).toBeNull()
  })

  it('marca "Gravações" como ativo em qualquer rota /history/*', () => {
    renderAt('/history/cam1')
    expect(document.getElementById('sidebar-gravacoes')?.className).toContain('bg-primary')
  })
})

// MotionNotificationsBell — extraído do sidebar legado (AppSidebar.tsx, id antigo
// "sidebar-notifications") pra dentro do sidebar novo, como 1º item do nav
// (mesma posição que tinha no legado). Cobertura própria de comportamento (clique,
// resolução de link) vive em MotionNotificationsBell.test.tsx; aqui só a posição.
describe('Sidebar — Eventos (notificações de movimento)', () => {
  it('#motion-notifications é o primeiro item do nav, antes de "Todas as câmeras"', () => {
    renderAt('/')
    const bell = document.getElementById('motion-notifications')!
    const allCameras = document.getElementById('sidebar-all-cameras')!
    expect(bell).toBeTruthy()
    expect(bell.compareDocumentPosition(allCameras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('mostra badge de não lidas quando unreadCount > 0', () => {
    motionUnreadCount = 5
    renderAt('/')
    expect(document.getElementById('motion-notifications')!.textContent).toContain('5')
  })
})
