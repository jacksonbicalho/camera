import { type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { getRole } from '../auth'
import { useDisplayMode, useSetDisplayMode } from '../contexts/DisplayModeContext'
import { navItemClass } from './sidebarFlyout'
import {
  BarChart2,
  CameraLogo,
  Cctv,
  Eye,
  Film,
  Gauge,
  HardDrive,
  History,
  Menu,
  Palette,
  Pencil,
  Search,
  Server,
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

// DisabledSidebarItem — item "em construção" (pedido do navigator): visível,
// com o mesmo estilo do rail, mas não clicável — sinaliza que a
// funcionalidade existe no roadmap sem linkar pra lugar nenhum ainda.
function DisabledSidebarItem({
  id,
  label,
  icon,
  showLabel,
}: {
  id: string
  label: string
  icon: ReactNode
  showLabel: boolean
}) {
  return (
    <button
      id={id}
      type="button"
      disabled
      title={`${label} — em construção`}
      aria-label={`${label} — em construção`}
      className={cn(navItemClass(false, showLabel), 'cursor-not-allowed opacity-55')}
    >
      {icon}
      {showLabel && <span className="truncate text-sm">{label}</span>}
    </button>
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
        <p className="px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
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
// altura da viewport. Só "Sistema" (Câmeras)/"Sobre" ficam
// visíveis pra todo mundo — Movimentos/Administração (inclui "Aparência")/Governança (e
// "Rastrear câmeras", dentro de Sistema) são admin-only, mesma regra de
// acesso que essas páginas já tinham. Nem o logo nem o avatar do usuário
// moram mais aqui — os dois migraram pra `TopBar.tsx` (barra full-width
// acima da linha Sidebar+conteúdo, renderizada pelo `Layout`) — o rail em si
// começa direto pelo botão "Recolher menu".
export default function Sidebar() {
  const { sidebar: sidebarMode } = useDisplayMode()
  const setDisplayMode = useSetDisplayMode()
  const collapsed = sidebarMode === 'icons-only'
  const showLabel = !collapsed
  const isAdmin = getRole() === 'admin'

  function toggleCollapse() {
    setDisplayMode('sidebar', collapsed ? 'icons-text' : 'icons-only')
  }

  return (
    <nav
      id="sidebar"
      aria-label="Navegação"
      className={cn(
        'flex shrink-0 flex-col border-r border-border bg-surface transition-[width]',
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
          className={cn(navItemClass(false, showLabel))}
        >
          <Menu className="h-5 w-5 shrink-0" />
          {showLabel && <span className="truncate text-sm">Recolher menu</span>}
        </button>

        <SidebarSection label="Eventos" showLabel={showLabel} divider>
          <DisabledSidebarItem
            id="sidebar-live-view"
            label="Live View"
            icon={<Eye className="h-5 w-5 shrink-0" />}
            showLabel={showLabel}
          />
        </SidebarSection>

        <SidebarSection label="Sistema" showLabel={showLabel} divider>
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
                id: 'sidebar-discover',
                to: '/settings/discover',
                label: 'Rastrear câmeras',
                icon: <Search className="h-5 w-5 shrink-0" />,
              }}
              showLabel={showLabel}
            />
          )}
        </SidebarSection>

        {isAdmin && (
          <SidebarSection label="Movimentos" showLabel={showLabel}>
            <SidebarNavLink
              item={{
                id: 'sidebar-analysis',
                to: '/settings/analysis',
                label: 'Análise de vídeo',
                icon: <Zap className="h-5 w-5 shrink-0" />,
                matchHash: '',
              }}
              showLabel={showLabel}
            />
            <SidebarNavLink
              item={{
                id: 'sidebar-label-events',
                to: '/settings/analysis#label-events',
                label: 'Rotular eventos',
                icon: <Pencil className="h-5 w-5 shrink-0" />,
                matchHash: '#label-events',
              }}
              showLabel={showLabel}
            />
            <SidebarNavLink
              item={{
                id: 'sidebar-history',
                to: '/history',
                label: 'Histórico',
                icon: <History className="h-5 w-5 shrink-0" />,
              }}
              showLabel={showLabel}
            />
          </SidebarSection>
        )}

        {isAdmin && (
          <SidebarSection label="Administração" showLabel={showLabel} divider>
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
                id: 'sidebar-server',
                to: '/settings/server',
                label: 'Servidor',
                icon: <Server className="h-5 w-5 shrink-0" />,
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
                id: 'sidebar-appearance',
                to: '/settings/appearance',
                label: 'Aparência',
                icon: <Palette className="h-5 w-5 shrink-0" />,
              }}
              showLabel={showLabel}
            />
          </SidebarSection>
        )}

        {isAdmin && (
          <SidebarSection label="Governança" showLabel={showLabel}>
            <SidebarNavLink
              item={{
                id: 'sidebar-recordings',
                to: '/recordings',
                label: 'Gravações',
                icon: <Film className="h-5 w-5 shrink-0" />,
              }}
              showLabel={showLabel}
            />
            <SidebarNavLink
              item={{
                id: 'sidebar-stats',
                to: '/settings/stats',
                label: 'Estatísticas',
                icon: <Gauge className="h-5 w-5 shrink-0" />,
              }}
              showLabel={showLabel}
            />
            <SidebarNavLink
              item={{
                id: 'sidebar-relatorios',
                to: '/reports',
                label: 'Relatórios',
                icon: <BarChart2 className="h-5 w-5 shrink-0" />,
              }}
              showLabel={showLabel}
            />
          </SidebarSection>
        )}

        <SidebarSection showLabel={showLabel} divider>
          <SidebarNavLink
            item={{
              id: 'sidebar-about',
              to: '/settings/about',
              label: 'Sobre',
              icon: <CameraLogo className="h-5 w-5 shrink-0" />,
            }}
            showLabel={showLabel}
          />
        </SidebarSection>
      </div>
    </nav>
  )
}
