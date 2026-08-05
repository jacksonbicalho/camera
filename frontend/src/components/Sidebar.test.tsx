import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { DisplayModeProvider } from '../contexts/DisplayModeContext'
import { getRole } from '../auth'
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
    const el = document.getElementById('sidebar-cameras')!
    expect(el).toBeTruthy()
    expect(el.getAttribute('href')).toBe('/settings/cameras')
    expect(document.getElementById('sidebar')).toBeTruthy()
  })

  it('recolhido por padrão (w-14, sem labels de texto) e o botão de recolher expande (w-48, com labels)', () => {
    renderAt('/')
    expect(document.getElementById('sidebar')?.className).toContain('w-14')
    expect(document.getElementById('sidebar')?.textContent).not.toContain('Câmeras')

    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar')?.className).toContain('w-48')
    expect(document.getElementById('sidebar')?.textContent).toContain('Câmeras')
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

// CA2: rail vira seções sempre visíveis (sem flyout popup por trás de um
// ícone "Configurações") — pedido do navigator. O link direto pra /events
// (existia numa versão anterior desta história) foi ocultado; o sino de
// notificações migrou pra TopBar (história feat/reorganizar-topbar-sidebar);
// a seção que os continha ficou sem cabeçalho visível (história
// feat/liveview-customizavel, T5 — pedido do navigator: um rótulo pra uma
// seção de item único ("Live View", sozinho ali) virou ruído).
describe('CA2: rail em seções sempre visíveis, sem link direto pra /events', () => {
  it('sino de notificações saiu do Sidebar (mudou pra TopBar); sem link pra /events', () => {
    renderAt('/')
    expect(document.getElementById('motion-notifications')).toBeNull()
    expect(document.querySelector('a[href="/events"]')).toBeNull()
    expect(document.getElementById('sidebar-events')).toBeNull()
  })

  it('não existe mais nenhum ícone/flyout único "Configurações"', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-config')).toBeNull()
    expect(document.getElementById('sidebar-config-sistema')).toBeNull()
  })

  it('CA6: seção do item "Ao vivo" não mostra cabeçalho de seção próprio ("Eventos", nem um <p> "Ao vivo" separado do link)', () => {
    renderAt('/')
    const sidebarText = document.getElementById('sidebar')?.textContent ?? ''
    expect(sidebarText).not.toContain('Eventos')
    // "Ao vivo" aparece como o próprio label do link (CA2 da história
    // liveview-player-footer-limpeza) — não como um <p> de cabeçalho de seção
    // (SidebarSection só renderiza <p> quando recebe `label`, e essa seção não recebe).
    const sectionHeaders = Array.from(document.querySelectorAll('#sidebar p.uppercase')).map(
      (p) => p.textContent,
    )
    expect(sectionHeaders).not.toContain('Ao vivo')
  })

  it('CA4/CA8: "Ao vivo" é um link de verdade pra / (página principal do sistema, T7)', () => {
    renderAt('/')
    const link = document.getElementById('sidebar-live-view')!
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/')
    // title/aria-label sempre têm o label, mesmo com o rail recolhido (só ícone) — o <span>
    // de texto só existe quando expandido (showLabel), não é o caso padrão deste teste.
    expect(link.getAttribute('title')).toBe('Ao vivo')
  })

  it('CA8: "Ao vivo" (to: "/") usa match exato (end) — não fica marcado ativo em outra rota', () => {
    renderAt('/settings/cameras')
    const link = document.getElementById('sidebar-live-view')!
    expect(link.className).not.toContain('bg-primary')
  })
})

// CA2 (história refactor/reorganizar-sidebar-ia): Gravações/Histórico/
// Relatórios migram de "Movimentos" pra dentro de "Sistema" — mesmo gate
// admin-only individual de antes, só reposicionados. Ordem final: Câmeras,
// Gravações, Histórico, Relatórios, Rastrear câmeras (que deixa de ser o 2º
// item e vira o último).
describe('CA2: seção "Sistema" ganha Gravações/Histórico/Relatórios, nesta ordem: Câmeras → Gravações → Histórico → Relatórios → Rastrear câmeras', () => {
  it('admin vê os 5 itens, com os hrefs certos e nessa ordem', () => {
    renderAt('/')
    const cameras = document.getElementById('sidebar-cameras')!
    const recordings = document.getElementById('sidebar-recordings')!
    const history = document.getElementById('sidebar-history')!
    const relatorios = document.getElementById('sidebar-relatorios')!
    const discover = document.getElementById('sidebar-discover')!

    expect(recordings.getAttribute('href')).toBe('/recordings')
    expect(history.tagName).toBe('A')
    expect(history.getAttribute('href')).toBe('/history')
    expect(relatorios.getAttribute('href')).toBe('/reports')
    expect(discover.getAttribute('href')).toBe('/settings/discover')

    const order = [cameras, recordings, history, relatorios, discover]
    for (let i = 0; i < order.length - 1; i++) {
      expect(
        order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  it('viewer vê só Câmeras — Gravações/Histórico/Relatórios/Rastrear câmeras continuam admin-only (mesmo gate de antes, só migrado de seção)', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-cameras')).toBeTruthy()
    expect(document.getElementById('sidebar-recordings')).toBeNull()
    expect(document.getElementById('sidebar-history')).toBeNull()
    expect(document.getElementById('sidebar-relatorios')).toBeNull()
    expect(document.getElementById('sidebar-discover')).toBeNull()
  })

  it('"Histórico" fica ativo em qualquer sub-rota /history/*', () => {
    renderAt('/history/cam1')
    expect(document.getElementById('sidebar-history')?.getAttribute('aria-current')).toBe('page')
  })
})

// CA3 (história refactor/reorganizar-sidebar-ia): "Movimentos" é renomeada
// pra "Inteligência Artificial" e fica só com os 3 itens de IA, nesta
// ordem: Análise de vídeo, Rotular eventos, Detectores de objetos (antes:
// Detectores de objetos, Análise de vídeo, Rotular eventos + os 3 itens que
// migraram pra Sistema no CA2 acima).
describe('CA3: seção "Movimentos" renomeada para "Inteligência Artificial" — só Análise de vídeo/Rotular eventos/Detectores de objetos, nessa ordem', () => {
  it('admin vê os 3 itens, com os hrefs certos e nessa ordem', () => {
    renderAt('/')
    const analysis = document.getElementById('sidebar-analysis')!
    const labelEvents = document.getElementById('sidebar-label-events')!
    const detectors = document.getElementById('sidebar-object-detectors')!

    expect(analysis.getAttribute('href')).toBe('/settings/analysis')
    expect(labelEvents.getAttribute('href')).toBe('/settings/label-events')
    expect(detectors.getAttribute('href')).toBe('/settings/detectors')

    expect(
      analysis.compareDocumentPosition(labelEvents) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      labelEvents.compareDocumentPosition(detectors) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('viewer não vê a seção (admin-only inteira, como "Movimentos" já era)', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-analysis')).toBeNull()
    expect(document.getElementById('sidebar-label-events')).toBeNull()
    expect(document.getElementById('sidebar-object-detectors')).toBeNull()
  })

  it('"Análise de vídeo" e "Rotular eventos" ficam ativos só na própria rota', () => {
    renderAt('/settings/analysis')
    expect(document.getElementById('sidebar-analysis')?.className).toContain('bg-primary')
    expect(document.getElementById('sidebar-label-events')?.className).not.toContain('bg-primary')

    cleanup()
    renderAt('/settings/label-events')
    expect(document.getElementById('sidebar-analysis')?.className).not.toContain('bg-primary')
    expect(document.getElementById('sidebar-label-events')?.className).toContain('bg-primary')
  })

  it('o cabeçalho da seção lê "Inteligência Artificial", não mais "Movimentos"', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    const sectionHeaders = Array.from(document.querySelectorAll('#sidebar p.uppercase')).map(
      (p) => p.textContent,
    )
    expect(sectionHeaders).toContain('Inteligência Artificial')
    expect(sectionHeaders).not.toContain('Movimentos')
    expect(document.body.textContent).not.toContain('Movimentos')
  })
})

describe('CA4/CA9: seção "Administração" (admin) — Servidor, Armazenamento, Usuários', () => {
  it('admin vê os 3 itens', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-storage')?.getAttribute('href')).toBe(
      '/settings/storage',
    )
    expect(document.getElementById('sidebar-server')?.getAttribute('href')).toBe('/settings/server')
    expect(document.getElementById('sidebar-users')?.getAttribute('href')).toBe('/settings/users')
  })

  it('viewer não vê a seção Administração', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-storage')).toBeNull()
    expect(document.getElementById('sidebar-server')).toBeNull()
    expect(document.getElementById('sidebar-users')).toBeNull()
  })
})

describe('CA3: seção "Administração" ganha o item "Aparência" (→ /settings/appearance)', () => {
  it('admin vê o item Aparência dentro de Administração', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-appearance')?.getAttribute('href')).toBe(
      '/settings/appearance',
    )
  })

  it('viewer não vê o item Aparência (seção Administração inteira é admin-only)', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-appearance')).toBeNull()
  })
})

describe('regressão: "Estatísticas" e "Governança" seguem fora do Sidebar (histórias anteriores)', () => {
  it('link "Estatísticas" não existe mais no sidebar', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-stats')).toBeNull()
  })

  it('seção "Governança" não existe mais (nem o texto do cabeçalho aparece, com o rail expandido)', () => {
    renderAt('/')
    // recolhido por padrão não mostra label de seção nenhum — expande antes de checar o
    // texto, senão a asserção passaria trivialmente mesmo com a seção ainda existindo.
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.body.textContent).not.toContain('Governança')
  })
})

describe('CA3: seção "Aparência" removida do Sidebar (accent + cor de fundo saíram)', () => {
  it('nem admin nem viewer veem os itens antigos da seção Aparência', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-appearance-accent')).toBeNull()
    expect(document.getElementById('sidebar-background-color')).toBeNull()

    cleanup()
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-appearance-accent')).toBeNull()
    expect(document.getElementById('sidebar-background-color')).toBeNull()
  })
})

describe('CA4: "Sobre" saiu do Sidebar (agora é o sub-link about-application do dropdown app-help na TopBar)', () => {
  it('nem admin nem viewer veem mais o item solto no Sidebar', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-about')).toBeNull()

    cleanup()
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-about')).toBeNull()
  })
})

// CA4 (história refactor/reorganizar-sidebar-ia): "Detectores de objetos"
// passa a ser o ÚLTIMO item de "Inteligência Artificial" (antes era o 1º) —
// mas a seção como um todo continua vindo antes de "Administração", isso
// não mudou.
describe('CA4: "Detectores de objetos" é o último item de "Inteligência Artificial", que segue antes de "Administração"', () => {
  it('"Detectores de objetos" vem depois de "Rotular eventos" (último da própria seção) e antes de "Servidor" (1º item de Administração)', () => {
    renderAt('/')
    const labelEvents = document.getElementById('sidebar-label-events')!
    const detectors = document.getElementById('sidebar-object-detectors')!
    const server = document.getElementById('sidebar-server')!

    expect(
      labelEvents.compareDocumentPosition(detectors) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      detectors.compareDocumentPosition(server) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
