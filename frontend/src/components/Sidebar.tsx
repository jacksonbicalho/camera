import { type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { getRole } from '../auth'
import { useDisplayMode, useSetDisplayMode } from '../contexts/DisplayModeContext'
import { useMobileNav } from '../contexts/MobileNavContext'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { navItemClass } from './sidebarFlyout'
import {
  BarChart2,
  Camera,
  Cctv,
  Eye,
  Film,
  Gauge,
  HardDrive,
  History,
  Menu,
  Network,
  Pencil,
  Search,
  Server,
  Settings,
  Users,
  Zap,
} from './Icons'

interface NavItemDef {
  id: string
  to: string
  label: string
  icon: ReactNode
  /** `/` só fica ativo na rota exata (senão casaria toda rota). */
  end?: boolean
  /**
   * Só relevante quando outro item da mesma seção aponta pro MESMO pathname
   * com um hash diferente (ex.: "Análise de vídeo" `/settings/analysis` e
   * "Rotular eventos" `/settings/analysis#label-events`) — o `isActive`
   * nativo do NavLink ignora o hash, então os dois acenderiam juntos sem
   * isso. Quando definido, o item só fica ativo se `location.hash` bater
   * exatamente com este valor (`''` = sem hash nenhum).
   */
  matchHash?: string
}

// SidebarNavLink — item de navegação comum (NavLink), usado dentro das
// seções do rail.
function SidebarNavLink({ item, showLabel }: { item: NavItemDef; showLabel: boolean }) {
  const location = useLocation()
  return (
    <NavLink
      id={item.id}
      to={item.to}
      end={item.end}
      title={item.label}
      aria-label={item.label}
      className={({ isActive }) => {
        const active =
          item.matchHash !== undefined ? isActive && location.hash === item.matchHash : isActive
        return navItemClass(active, showLabel)
      }}
    >
      {item.icon}
      {showLabel && <span className="truncate text-sm">{item.label}</span>}
    </NavLink>
  )
}

// SidebarSection — agrupa itens do rail sob um cabeçalho (só visível quando
// expandido) e um separador discreto acima — pedido do navigator: seções
// sempre visíveis empilhadas no rail (não mais um flyout popup por trás de
// um único ícone "Configurações").
function SidebarSection({
  label,
  showLabel,
  divider,
  children,
}: {
  label?: string
  showLabel: boolean
  /** Separador discreto acima da seção — todas menos a 1ª. */
  divider?: boolean
  children: ReactNode
}) {
  return (
    // Lei da proximidade: mais espaço ACIMA do título (pt-4, separa do grupo
    // anterior) do que ABAIXO dele (pb-0.5, gruda visualmente nos próprios
    // itens) — pedido do navigator: os dois estavam quase iguais, e o
    // cabeçalho parecia "no meio do caminho" entre as duas seções em vez de
    // claramente pertencer à que vem depois.
    <div className={cn(divider && 'border-t border-border/70 pt-4', showLabel ? 'w-full' : 'w-10')}>
      {showLabel && label && (
        <p
          title={label}
          className="truncate px-3 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-muted"
        >
          {label}
        </p>
      )}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

// Sidebar — rail de navegação agrupado em seções sempre visíveis (pedido do
// navigator — substitui o antigo flyout popup por trás de um único ícone
// "Configurações"): recolhido mostra só ícones; expandido mostra também os
// cabeçalhos de seção e rola (scrollbar-thin) quando o conteúdo excede a
// altura da viewport. Só "Câmeras" (dentro de "Câmeras e Gravações") fica
// visível pra todo mundo — o resto de Câmeras e Gravações (Gravações/
// Histórico/Relatórios), a seção Inteligência inteira (Análise de vídeo/
// Rotular eventos/Detectores de objetos) e Administração (inclui
// "Rastrear câmeras" e "Aparência") são admin-only, mesma regra de acesso
// que essas páginas já tinham. Nem o logo, nem o
// avatar do usuário, nem o item
// "Sobre" moram mais aqui — migraram pra `TopBar.tsx` (barra full-width
// acima da linha Sidebar+conteúdo, renderizada pelo `Layout`; "Sobre" virou
// o sub-link `about-application` do dropdown `AppHelpMenu`) — o rail em si
// começa direto pelo botão "Recolher menu".
export default function Sidebar() {
  const { sidebar: sidebarMode } = useDisplayMode()
  const setDisplayMode = useSetDisplayMode()
  const collapsed = sidebarMode === 'icons-only'
  const { open, close } = useMobileNav()
  // No drawer mobile (open=true), sempre mostra os rótulos — a preferência de
  // colapso persistida é só pro rail de desktop (icons-only por padrão); sem
  // isso, um usuário que só acessa via celular abriria o drawer e veria só
  // ícones sem legenda, sem NENHUM jeito de expandir (o botão sidebar-collapse
  // é `hidden lg:flex`, não existe no drawer). `open` só é `true` via o
  // hamburguer (`lg:hidden`), então isso não afeta o comportamento em desktop.
  const showLabel = !collapsed || open
  const isAdmin = getRole() === 'admin'

  function toggleCollapse() {
    setDisplayMode('sidebar', collapsed ? 'icons-text' : 'icons-only')
  }

  // Abaixo de `lg` o rail vira um drawer off-canvas (`position: fixed`, sai do
  // fluxo sozinho — ver Layout.tsx); em `lg`+ nada muda, mesmo rail
  // persistente de sempre. Fecha ao clicar num link (delegação — qualquer <a>
  // dentro do rail, evita passar onClick por cada item), no backdrop, ou via
  // Escape.
  function handleNavClick(e: React.MouseEvent<HTMLElement>) {
    if ((e.target as HTMLElement).closest('a')) close()
  }
  useEscapeKey(close, open)

  return (
    <>
      {open && (
        <div
          id="mobile-nav-backdrop"
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={close}
        />
      )}
      <nav
        id="sidebar"
        aria-label="Navegação"
        onClick={handleNavClick}
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-surface transition-transform lg:static lg:z-auto lg:shrink-0 lg:translate-x-0 lg:transition-[width]',
          open ? 'translate-x-0' : '-translate-x-full',
          showLabel ? 'w-48 items-stretch' : 'w-14 items-center',
        )}
      >
        <div
          className={cn(
            'scrollbar-thin flex flex-1 flex-col gap-2 overflow-y-auto py-3',
            showLabel ? 'items-stretch px-2' : 'items-center',
          )}
        >
          <button
            id="sidebar-collapse"
            type="button"
            onClick={toggleCollapse}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={cn(navItemClass(false, showLabel), 'hidden lg:flex')}
          >
            <Menu className="h-5 w-5 shrink-0" />
            {showLabel && <span className="truncate text-sm">Recolher menu</span>}
          </button>

          <SidebarSection showLabel={showLabel} divider>
            <SidebarNavLink
              item={{
                id: 'sidebar-live-view',
                to: '/',
                end: true,
                label: 'Ao vivo',
                icon: <Eye className="h-5 w-5 shrink-0" />,
              }}
              showLabel={showLabel}
            />
          </SidebarSection>

          <SidebarSection label="Câmeras e Gravações" showLabel={showLabel} divider>
            <SidebarNavLink
              item={{
                id: 'sidebar-cameras',
                to: '/settings/cameras',
                label: 'Câmeras',
                icon: <Cctv className="h-5 w-5 shrink-0" />,
              }}
              showLabel={showLabel}
            />
            {isAdmin && (
              <SidebarNavLink
                item={{
                  id: 'sidebar-recordings',
                  to: '/recordings',
                  label: 'Gravações',
                  icon: <Film className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
            )}
            {isAdmin && (
              <SidebarNavLink
                item={{
                  id: 'sidebar-history',
                  to: '/history',
                  label: 'Histórico',
                  icon: <History className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
            )}
            {isAdmin && (
              <SidebarNavLink
                item={{
                  id: 'sidebar-relatorios',
                  to: '/reports',
                  label: 'Relatórios',
                  icon: <BarChart2 className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
            )}
          </SidebarSection>

          {isAdmin && (
            <SidebarSection label="Inteligência" showLabel={showLabel} divider>
              <SidebarNavLink
                item={{
                  id: 'sidebar-analysis',
                  to: '/settings/analysis',
                  label: 'Análise de vídeo',
                  icon: <Zap className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
              <SidebarNavLink
                item={{
                  id: 'sidebar-label-events',
                  to: '/settings/label-events',
                  label: 'Rotular eventos',
                  icon: <Pencil className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
              <SidebarNavLink
                item={{
                  id: 'sidebar-object-detectors',
                  to: '/settings/detectors',
                  label: 'Detectores de objetos',
                  icon: <Camera className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
              <SidebarNavLink
                item={{
                  id: 'sidebar-trainers',
                  to: '/settings/trainers',
                  label: 'Treinadores',
                  icon: <Gauge className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
              <SidebarNavLink
                item={{
                  id: 'sidebar-states',
                  to: '/settings/states',
                  label: 'Estados',
                  icon: <Network className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
            </SidebarSection>
          )}

          {isAdmin && (
            <SidebarSection label="Administração" showLabel={showLabel} divider>
              <SidebarNavLink
                item={{
                  id: 'sidebar-server',
                  to: '/settings/server',
                  label: 'Servidor',
                  icon: <Server className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
              <SidebarNavLink
                item={{
                  id: 'sidebar-storage',
                  to: '/settings/storage',
                  label: 'Armazenamento',
                  icon: <HardDrive className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
              <SidebarNavLink
                item={{
                  id: 'sidebar-discover',
                  to: '/settings/discover',
                  label: 'Rastrear câmeras',
                  icon: <Search className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
              <SidebarNavLink
                item={{
                  id: 'sidebar-users',
                  to: '/settings/users',
                  label: 'Usuários',
                  icon: <Users className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
              <SidebarNavLink
                item={{
                  id: 'sidebar-preferences',
                  to: '/settings/preferences/extensions',
                  label: 'Preferências',
                  icon: <Settings className="h-5 w-5 shrink-0" />,
                }}
                showLabel={showLabel}
              />
            </SidebarSection>
          )}
        </div>
      </nav>
    </>
  )
}
