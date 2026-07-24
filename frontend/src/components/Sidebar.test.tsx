import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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
    notifications: motionNotifications,
    unreadCount: motionUnreadCount,
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
    expect(document.getElementById('sidebar-all-cameras')?.getAttribute('aria-label')).toBe(
      'Todas as câmeras',
    )
  })

  it('"Todas as câmeras" (to="/") não fica ativo fora da rota exata', () => {
    renderAt('/history/cam1')
    expect(document.getElementById('sidebar-all-cameras')?.getAttribute('aria-current')).toBeNull()
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
    const sairBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Sair',
    )!
    fireEvent.click(sairBtn)
    expect(clearToken).toHaveBeenCalled()
  })

  it('recolhido por padrão (w-14, sem labels de texto) e o botão de recolher expande (w-48, com labels)', () => {
    renderAt('/')
    expect(document.getElementById('sidebar')?.className).toContain('w-14')
    expect(document.getElementById('sidebar')?.textContent).not.toContain('Todas as câmeras')

    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar')?.className).toContain('w-48')
    expect(document.getElementById('sidebar')?.textContent).toContain('Todas as câmeras')
    expect(document.getElementById('sidebar')?.textContent).toContain('Eventos')
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

// MotionNotificationsBell — extraído do sidebar legado (AppSidebar.tsx, id antigo
// "sidebar-notifications") pra dentro do sidebar novo, como 1º item do nav
// (mesma posição que tinha no legado). Cobertura própria de comportamento (clique,
// resolução de link) vive em MotionNotificationsBell.test.tsx; aqui só a posição.
describe('Sidebar — sino de notificações de movimento', () => {
  it('#motion-notifications é o primeiro item do nav, antes de "Eventos"', () => {
    renderAt('/')
    const bell = document.getElementById('motion-notifications')!
    const events = document.getElementById('sidebar-events')!
    expect(bell).toBeTruthy()
    expect(bell.compareDocumentPosition(events) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('mostra badge de não lidas quando unreadCount > 0', () => {
    motionUnreadCount = 5
    renderAt('/')
    expect(document.getElementById('motion-notifications')!.textContent).toContain('5')
  })
})

// "Eventos" — link novo pra rota /events (já existia, PlaceholderPage, mas nunca
// tinha aparecido em nenhum menu antes desta história).
describe('Sidebar — Eventos', () => {
  it('é um NavLink com id sidebar-events, href "/events", antes de "Todas as câmeras"', () => {
    renderAt('/')
    const el = document.getElementById('sidebar-events')!
    expect(el.tagName).toBe('A')
    expect(el.getAttribute('href')).toBe('/events')
    const allCameras = document.getElementById('sidebar-all-cameras')!
    expect(el.compareDocumentPosition(allCameras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('fica ativo em "/events"', () => {
    renderAt('/events')
    expect(document.getElementById('sidebar-events')?.getAttribute('aria-current')).toBe('page')
  })
})

// CA2: rail enxuto — sino, Eventos, Todas as câmeras, os dois ícones de
// Configurações e o usuário; SEM Gravações/Momentos/Histórico/Relatórios como
// itens diretos (saíram pro menu de Configurações — ver describes abaixo).
describe('CA2: rail sem Gravações/Momentos/Histórico/Relatórios como itens diretos', () => {
  it('mostra só os itens esperados no rail (fora dos flyouts)', () => {
    renderAt('/')
    expect(document.getElementById('motion-notifications')).toBeTruthy()
    expect(document.getElementById('sidebar-events')).toBeTruthy()
    expect(document.getElementById('sidebar-all-cameras')).toBeTruthy()
    expect(document.getElementById('sidebar-config')).toBeTruthy()
    expect(document.getElementById('sidebar-config-sistema')).toBeTruthy()
    expect(document.getElementById('sidebar-user')).toBeTruthy()
  })

  it('não tem mais NavLink/botão direto pra Gravações, Momentos, Histórico ou Relatórios', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-recordings')).toBeNull()
    expect(document.getElementById('sidebar-motions')).toBeNull()
    expect(document.getElementById('sidebar-history')).toBeNull()
    expect(document.getElementById('sidebar-relatorios')).toBeNull()
  })

  it('os dois ícones de Configurações são botões (não links), sem navegar direto', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-config')!.tagName).toBe('BUTTON')
    expect(document.getElementById('sidebar-config-sistema')!.tagName).toBe('BUTTON')
  })
})

// CA3: flyout/coluna "Configurações" — grupo Câmeras.
describe('CA3: menu Configurações lista Câmeras, Rastrear câmeras, Gravações, Momentos e Histórico', () => {
  const cameras = [{ id: 'cam1', name: 'Corredor' }]

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(cameras) })),
    )
  })

  it('mostra o cabeçalho de grupo "Configurações" e os links esperados', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    expect(document.body.textContent).toContain('Configurações')
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/discover"]')).toBeTruthy()
    expect(document.querySelector('a[href="/recordings"]')).toBeTruthy()
    expect(document.querySelector('a[href="/motions"]')).toBeTruthy()
    expect(document.getElementById('settings-nav-history')).toBeTruthy()
  })

  it('"Histórico" é um botão (picker), não um link — abre um seletor de câmera e navega ao escolher', async () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    const historyBtn = document.getElementById('settings-nav-history')!
    expect(historyBtn.tagName).toBe('BUTTON')
    fireEvent.click(historyBtn)
    await waitFor(() => {
      expect(document.getElementById('settings-nav-history-camera-cam1')).toBeTruthy()
    })
    fireEvent.click(document.getElementById('settings-nav-history-camera-cam1')!)
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/history/cam1')
    })
    // fechou os dois flyouts (o interno da câmera e o externo de Configurações)
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeNull()
  })

  it('navega ao clicar de verdade (mousedown+click) numa câmera do picker aninhado — o outside-click do flyout externo não pode fechar o interno antes do click completar', async () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    fireEvent.click(document.getElementById('settings-nav-history')!)
    await waitFor(() => {
      expect(document.getElementById('settings-nav-history-camera-cam1')).toBeTruthy()
    })
    const camBtn = document.getElementById('settings-nav-history-camera-cam1')!
    // fireEvent.click sozinho não dispara mousedown — um clique real de mouse
    // dispara os dois, nessa ordem, e é o mousedown que o listener de
    // "clique fora" (useFlyout) escuta pra decidir se fecha o flyout.
    fireEvent.mouseDown(camBtn)
    expect(document.body.contains(camBtn)).toBe(true)
    fireEvent.click(camBtn)
    await waitFor(() => {
      expect(document.getElementById('test-location')!.textContent).toBe('/history/cam1')
    })
  })

  it('viewer não vê "Rastrear câmeras", mas continua vendo Câmeras/Gravações/Momentos/Histórico', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    expect(document.querySelector('a[href="/settings/cameras"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/discover"]')).toBeNull()
    expect(document.querySelector('a[href="/recordings"]')).toBeTruthy()
    expect(document.querySelector('a[href="/motions"]')).toBeTruthy()
    expect(document.getElementById('settings-nav-history')).toBeTruthy()
  })

  it('fica ativo (bg-primary) em /settings/cameras, /settings/discover, /recordings, /motions ou /history/*', () => {
    for (const path of [
      '/settings/cameras',
      '/settings/discover',
      '/recordings',
      '/motions',
      '/history/cam1',
    ]) {
      renderAt(path)
      expect(document.getElementById('sidebar-config')?.className, path).toContain('bg-primary')
      cleanup()
    }
  })

  it('flyout fecha ao selecionar um link', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config')!)
    const link = document.querySelector('a[href="/settings/cameras"]')!
    fireEvent.click(link)
    expect(document.querySelector('a[href="/settings/discover"]')).toBeNull()
  })
})

// CA4: flyout/coluna "Configurações do Sistema" — grupo Sistema.
describe('CA4: menu Configurações do Sistema lista Servidor, Análise de vídeo, Usuários e Aparência', () => {
  it('mostra o cabeçalho de grupo e os links esperados (admin)', () => {
    renderAt('/')
    const btn = document.getElementById('sidebar-config-sistema')!
    expect(btn.tagName).toBe('BUTTON')
    expect(document.querySelector('a[href="/settings/storage"]')).toBeNull()
    fireEvent.click(btn)
    expect(document.body.textContent).toContain('Configurações do Sistema')
    expect(document.querySelector('a[href="/settings/storage"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/storage"]')?.textContent).toBe('Servidor')
    expect(document.querySelector('a[href="/settings/analysis"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/users"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/appearance"]')).toBeTruthy()
  })

  it('mostra os widgets de tema/accent logo depois de "Aparência" (último item do grupo)', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config-sistema')!)
    expect(document.getElementById('theme-mode-nav')).not.toBeNull()
    expect(document.getElementById('accent-swatch-nav')).not.toBeNull()
    expect(document.getElementById('accent-swatch-default')).not.toBeNull()
    expect(document.getElementById('accent-swatch-violet')).not.toBeNull()
    expect(document.getElementById('accent-swatch-teal')).not.toBeNull()
    expect(document.getElementById('accent-swatch-coral')).not.toBeNull()
    expect(document.getElementById('accent-swatch-amber')).not.toBeNull()
  })

  it('viewer não vê Análise de vídeo/Usuários, mas continua vendo Servidor (→ /settings/stats) e Aparência', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config-sistema')!)
    expect(document.querySelector('a[href="/settings/stats"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/stats"]')?.textContent).toBe('Servidor')
    expect(document.querySelector('a[href="/settings/appearance"]')).toBeTruthy()
    expect(document.querySelector('a[href="/settings/users"]')).toBeNull()
    expect(document.querySelector('a[href="/settings/analysis"]')).toBeNull()
    expect(document.querySelector('a[href="/settings/storage"]')).toBeNull()
  })

  it('fica ativo (bg-primary) em /settings/storage e nas rotas que ainda vão virar abas de Servidor', () => {
    for (const path of [
      '/settings/storage',
      '/settings/system',
      '/settings/stats',
      '/settings/reports',
      '/settings/about',
    ]) {
      renderAt(path)
      expect(document.getElementById('sidebar-config-sistema')?.className, path).toContain(
        'bg-primary',
      )
      cleanup()
    }
  })

  it('flyout fecha ao selecionar um link', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-config-sistema')!)
    const link = document.querySelector('a[href="/settings/users"]')!
    fireEvent.click(link)
    expect(document.querySelector('a[href="/settings/appearance"]')).toBeNull()
  })
})
