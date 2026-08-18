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
// Relatórios migram de "Movimentos" pra dentro da seção "Sistema" (T2 desta
// mesma história a renomeia pra "Câmeras e Gravações", ver CA5 — o CA2 aqui
// testa a ordem/gate dos itens, não o nome da seção) — mesmo gate
// admin-only individual de antes, só reposicionados. Ordem final: Câmeras,
// Gravações, Histórico, Relatórios. "Rastrear câmeras" saiu daqui e foi pra
// dentro de "Administração" (pedido do navigator testando a branch de
// refactor/camera-tabs-para-sidebar-ia — ver describe de Administração).
describe('CA2: seção "Câmeras e Gravações" (ex-"Sistema") ganha Gravações/Histórico/Relatórios, nesta ordem: Câmeras → Gravações → Histórico → Relatórios', () => {
  it('admin vê os 4 itens, com os hrefs certos e nessa ordem', () => {
    renderAt('/')
    const cameras = document.getElementById('sidebar-cameras')!
    const recordings = document.getElementById('sidebar-recordings')!
    const history = document.getElementById('sidebar-history')!
    const relatorios = document.getElementById('sidebar-relatorios')!

    expect(recordings.getAttribute('href')).toBe('/recordings')
    expect(history.tagName).toBe('A')
    expect(history.getAttribute('href')).toBe('/history')
    expect(relatorios.getAttribute('href')).toBe('/reports')

    const order = [cameras, recordings, history, relatorios]
    for (let i = 0; i < order.length - 1; i++) {
      expect(
        order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
  })

  it('CA2: viewer também vê Gravações/Histórico/Relatórios (mesmo padrão de "Câmeras" — nunca teve por que ser admin-only)', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-cameras')).toBeTruthy()
    expect(document.getElementById('sidebar-recordings')).toBeTruthy()
    expect(document.getElementById('sidebar-history')).toBeTruthy()
    expect(document.getElementById('sidebar-relatorios')).toBeTruthy()
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

  it('o cabeçalho da seção lê "Inteligência" (encurtado de "Inteligência Artificial" — pedido do navigator, corrigia também a quebra de linha do rail), não mais "Movimentos"', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    const sectionHeaders = Array.from(document.querySelectorAll('#sidebar p.uppercase')).map(
      (p) => p.textContent,
    )
    expect(sectionHeaders).toContain('Inteligência')
    expect(sectionHeaders).not.toContain('Movimentos')
    expect(document.body.textContent).not.toContain('Movimentos')
  })
})

describe('CA4/CA9: seção "Administração" (admin) — Servidor, Usuários', () => {
  it('admin vê os itens', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-server')?.getAttribute('href')).toBe('/settings/server')
    expect(document.getElementById('sidebar-users')?.getAttribute('href')).toBe('/settings/users')
  })

  // CA (história refactor/preferencias-submenu-lateral-storage): Armazenamento
  // deixou de ser item solo do rail — migrou pra dentro de Preferências
  // (/settings/preferences/storage, item do PreferencesLayout), mesmo
  // precedente de quando Aparência saiu do rail.
  it('não mostra mais o item solo "Armazenamento" (migrou pra dentro de Preferências)', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-storage')).toBeNull()
  })

  it('viewer não vê a seção Administração', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-server')).toBeNull()
    expect(document.getElementById('sidebar-users')).toBeNull()
  })
})

// Regressão (feedback do navigator testando a branch de
// refactor/camera-tabs-para-sidebar-ia): "Rastrear câmeras" saiu de "Câmeras
// e Gravações" e foi pra "Administração", logo depois de "Servidor" (antes:
// depois de "Armazenamento", item removido do rail na história
// refactor/preferencias-submenu-lateral-storage).
describe('regressão: "Rastrear câmeras" migrou pra "Administração", depois de "Servidor"', () => {
  it('admin vê "Rastrear câmeras" dentro de Administração, entre Servidor e Usuários', () => {
    renderAt('/')
    const server = document.getElementById('sidebar-server')!
    const discover = document.getElementById('sidebar-discover')!
    const users = document.getElementById('sidebar-users')!

    expect(discover.getAttribute('href')).toBe('/settings/discover')
    expect(server.compareDocumentPosition(discover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(discover.compareDocumentPosition(users) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('viewer não vê "Rastrear câmeras" (seção Administração inteira é admin-only)', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-discover')).toBeNull()
  })
})

// CA3 (história refactor/mover-appearance-preferencias): "Aparência" deixou
// de ser item próprio do Sidebar — virou item do submenu de Preferências
// (PreferencesLayout). Substitui o describe anterior que testava
// sidebar-appearance como item independente.
describe('CA3: item "Aparência" sai do Sidebar (migrou pra dentro de Preferências)', () => {
  it('nem admin nem viewer veem mais o item "Aparência" no Sidebar', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-appearance')).toBeNull()

    cleanup()
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-appearance')).toBeNull()
  })
})

// CA3 (história refactor/mover-analise-para-cadastro-camera): "Análise por
// câmera" deixou de ser item próprio do Sidebar/rota — virou uma sessão
// dentro do cadastro de câmera (CameraAnalysisSection).
describe('CA3: item "Análise por câmera" sai do Sidebar (migrou pro cadastro de câmera)', () => {
  it('nem admin nem viewer veem mais o item "Análise por câmera" no Sidebar', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-analyses')).toBeNull()

    cleanup()
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-analyses')).toBeNull()
  })
})

describe('Sidebar tem o item "Preferências" (→ /settings/preferences/extensions) dentro de Administração', () => {
  it('admin vê o item Preferências dentro de Administração', () => {
    renderAt('/')
    const preferences = document.getElementById('sidebar-preferences')!

    expect(preferences.getAttribute('href')).toBe('/settings/preferences/extensions')
  })

  it('viewer não vê o item Preferências (seção Administração inteira é admin-only)', () => {
    vi.mocked(getRole).mockReturnValue('viewer')
    renderAt('/')
    expect(document.getElementById('sidebar-preferences')).toBeNull()
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

// CA5 (história refactor/reorganizar-sidebar-ia, T2): "Sistema" renomeada
// pra "Câmeras e Gravações" (feedback do navigator: nome vago pro conteúdo
// real da seção); cabeçalhos de seção ganham mais destaque visual
// (font-bold/text-muted em vez de font-semibold/text-faint — ficavam mais
// apagados que os próprios itens de navegação abaixo deles).
describe('CA5: seção "Sistema" renomeada para "Câmeras e Gravações"; cabeçalhos de seção com font-bold/text-muted', () => {
  it('o cabeçalho lê "Câmeras e Gravações", não mais "Sistema"', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    const sectionHeaders = Array.from(document.querySelectorAll('#sidebar p.uppercase')).map(
      (p) => p.textContent,
    )
    expect(sectionHeaders).toContain('Câmeras e Gravações')
    expect(sectionHeaders).not.toContain('Sistema')
  })

  it('o texto do cabeçalho de seção usa font-bold e text-muted (não font-semibold/text-faint)', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    const header = Array.from(document.querySelectorAll('#sidebar p.uppercase')).find(
      (p) => p.textContent === 'Câmeras e Gravações',
    )!
    expect(header.className).toContain('font-bold')
    expect(header.className).toContain('text-muted')
    expect(header.className).not.toContain('font-semibold')
    expect(header.className).not.toContain('text-faint')
  })
})

// CA2 (história fix/sidebar-divider-ia): a seção "Inteligência Artificial"
// ficou sem a prop `divider` do SidebarSection por inconsistência — as
// outras 3 seções (sem cabeçalho/"Ao vivo", "Câmeras e Gravações",
// "Administração") já têm o separador `border-t` acima do cabeçalho.
describe('CA2: seção "Inteligência Artificial" tem o mesmo separador (border-t) que as demais seções', () => {
  it('o wrapper da seção tem border-t, igual a "Câmeras e Gravações" e "Administração"', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    const header = Array.from(document.querySelectorAll('#sidebar p.uppercase')).find(
      (p) => p.textContent === 'Inteligência',
    )!
    expect(header.parentElement!.className).toContain('border-t')
  })
})

// Regressão (feedback do navigator testando a branch de
// refactor/camera-tabs-para-sidebar-ia no desktop real): "Inteligência
// Artificial" (label original, depois encurtado pra "Inteligência" — ver
// CA3 acima) era o label de seção mais longo do rail e quebrava em 2 linhas
// dentro da largura fixa do rail expandido (w-48) — o cabeçalho nunca tinha
// whitespace-nowrap/truncate, então o wrap padrão do navegador entrava em
// ação quando o texto não cabia. `truncate` (nowrap+overflow-hidden+
// ellipsis) garante uma linha só sempre, independente de métrica de fonte —
// mantido como garantia estrutural pra QUALQUER label de seção, mesmo após
// o encurtamento ter aliviado o caso específico que motivou o fix.
describe('regressão: cabeçalho de seção nunca quebra em 2 linhas (truncate + title pro texto completo)', () => {
  it('o cabeçalho "Inteligência" tem a classe truncate e o title com o texto completo', () => {
    renderAt('/')
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    const header = Array.from(document.querySelectorAll('#sidebar p.uppercase')).find(
      (p) => p.textContent === 'Inteligência',
    )!
    expect(header.className).toContain('truncate')
    expect(header.getAttribute('title')).toBe('Inteligência')
  })
})

describe('CA3: classificação de estado removida — sem item "Estados"', () => {
  it('não renderiza mais o link #sidebar-states nem o texto "Estados"', () => {
    renderAt('/')
    expect(document.getElementById('sidebar-states')).toBeNull()
    fireEvent.click(document.getElementById('sidebar-collapse')!)
    expect(document.getElementById('sidebar')?.textContent).not.toContain('Estados')
  })
})
