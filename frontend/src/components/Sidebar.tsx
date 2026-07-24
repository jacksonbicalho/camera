import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { clearToken, getRole, getUsername } from '../auth'
import { useUserNotifications } from '../contexts/UserNotificationContext'
import { useDisplayMode, useSetDisplayMode } from '../contexts/DisplayModeContext'
import {
  ADMIN_SETTINGS_GROUPS,
  VIEWER_SETTINGS_GROUPS,
  isNavItemActive,
  type SettingsNavGroup,
} from './settingsNavLinks'
import ThemeModeNav from './ThemeModeNav'
import AccentSwatchNav from './AccentSwatchNav'
import MotionNotificationsBell from './MotionNotificationsBell'
import SettingsNavGroups from './SettingsNavGroups'
import { navItemClass, useFlyout } from './sidebarFlyout'
import { CameraLogo, Cctv, ChevronLeft, CircleUser, HardDrive, Settings, Zap } from './Icons'

interface NavItem {
  id: string
  to: string
  label: string
  icon: ReactNode
  /** `/` só fica ativo na rota exata (senão casaria toda rota). */
  end?: boolean
}

const items: NavItem[] = [
  {
    id: 'sidebar-events',
    to: '/events',
    label: 'Eventos',
    icon: <Zap className="h-5 w-5" />,
  },
  {
    id: 'sidebar-all-cameras',
    to: '/',
    label: 'Todas as câmeras',
    icon: <Cctv className="h-5 w-5" />,
    end: true,
  },
]

// ConfigGroupFlyout — botão que abre um flyout com UM grupo de
// settingsNavLinks.ts (SettingsNavGroups, mesmo renderer da coluna
// persistente de SettingsLayout). O Sidebar tem dois desses lado a lado
// (Câmeras / Sistema) em vez do único flyout "Configurações" de antes —
// pedido do navigator (ver a análise/story). `extra`, quando presente, é
// renderizado logo depois da lista do grupo (usado só pelo grupo Sistema,
// pros widgets ThemeModeNav/AccentSwatchNav — ficam logo após "Aparência",
// que é o último item desse grupo).
function ConfigGroupFlyout({
  id,
  label,
  icon,
  showLabel,
  group,
  extra,
}: {
  id: string
  label: string
  icon: ReactNode
  showLabel: boolean
  group: SettingsNavGroup
  extra?: (onSelect: () => void) => ReactNode
}) {
  const { pathname } = useLocation()
  const { open, setOpen, pos, btnRef, panelRef, toggle } = useFlyout<HTMLButtonElement>()
  const active = group.items.some((item) => isNavItemActive(item, pathname))

  return (
    <>
      <button
        id={id}
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={label}
        aria-label={label}
        className={navItemClass(active || open, showLabel)}
      >
        {icon}
        {showLabel && <span className="truncate text-sm">{label}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', bottom: pos.bottom, left: pos.left, zIndex: 9999 }}
            className="w-48 rounded-lg border border-border bg-surface py-1 shadow-xl"
          >
            <SettingsNavGroups groups={[group]} ariaLabel={label} onSelect={() => setOpen(false)} />
            {extra?.(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  )
}

// ConfiguracoesFlyout — 1º ícone de configuração: grupo "Câmeras" (Câmeras,
// Rastrear câmeras, Gravações, Momentos, Histórico).
function ConfiguracoesFlyout({ showLabel }: { showLabel: boolean }) {
  const group = (getRole() === 'admin' ? ADMIN_SETTINGS_GROUPS : VIEWER_SETTINGS_GROUPS)[0]
  return (
    <ConfigGroupFlyout
      id="sidebar-config"
      label="Configurações"
      icon={<Settings className="h-5 w-5 shrink-0" />}
      showLabel={showLabel}
      group={group}
    />
  )
}

// ConfiguracoesSistemaFlyout — 2º ícone de configuração: grupo "Sistema"
// (Servidor, Análise de vídeo, Usuários, Aparência) + os widgets de
// tema/accent logo depois de "Aparência".
function ConfiguracoesSistemaFlyout({ showLabel }: { showLabel: boolean }) {
  const group = (getRole() === 'admin' ? ADMIN_SETTINGS_GROUPS : VIEWER_SETTINGS_GROUPS)[1]
  return (
    <ConfigGroupFlyout
      id="sidebar-config-sistema"
      label="Configurações do Sistema"
      icon={<HardDrive className="h-5 w-5 shrink-0" />}
      showLabel={showLabel}
      group={group}
      extra={(onSelect) => (
        <>
          <ThemeModeNav onSelect={onSelect} />
          <AccentSwatchNav onSelect={onSelect} />
        </>
      )}
    />
  )
}

// UserMenu — avatar do usuário logado no rodapé do rail, mesmo padrão de flyout
// do SettingsFlyout: Notificações, Perfil e Sair.
function UserMenu({ showLabel }: { showLabel: boolean }) {
  const navigate = useNavigate()
  const { open, setOpen, pos, btnRef, panelRef, toggle } = useFlyout<HTMLButtonElement>()
  const { unreadCount } = useUserNotifications()
  const username = getUsername() ?? 'usuário'
  const roleLabel = getRole() === 'admin' ? 'Administrador' : 'Visualizador'

  function logout() {
    clearToken()
    setOpen(false)
    navigate('/login')
  }

  return (
    <>
      <button
        id="sidebar-user"
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={username}
        aria-label={username}
        className={navItemClass(open, showLabel)}
      >
        {/* badge de não-lidas ancorado ao ícone (span relative própria) — não ao botão
            inteiro, senão com showLabel (botão largo) o badge ficaria longe do ícone. */}
        <span className="relative inline-flex shrink-0">
          <CircleUser className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        {showLabel && <span className="truncate text-sm">{username}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', bottom: pos.bottom, left: pos.left, zIndex: 9999 }}
            className="w-44 rounded-lg border border-border bg-surface py-1 shadow-xl"
          >
            <div className="truncate border-b border-border px-3 py-2 text-caption text-faint">
              {username} · {roleLabel}
            </div>
            <NavLink
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-body text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              Notificações
            </NavLink>
            <NavLink
              to="/profile"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-body text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              Perfil
            </NavLink>
            <button
              type="button"
              onClick={logout}
              className="block w-full px-3 py-1.5 text-left text-body text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              Sair
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}

// Sidebar — rail de navegação enxuto para o Layout (páginas novas). Links +
// recolher/expandir (DisplayModeContext global, só 2 modos: icons-only/icons-text
// — ver o tipo DisplayMode) + os dois flyouts de Configurações + UserMenu.
export default function Sidebar() {
  const { sidebar: sidebarMode } = useDisplayMode()
  const setDisplayMode = useSetDisplayMode()
  const collapsed = sidebarMode === 'icons-only'
  const showLabel = !collapsed

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
      <Link
        to="/"
        id="sidebar-logo"
        className={cn(
          'flex items-center h-14 hover:opacity-80 transition-opacity border-b border-border flex-none',
          showLabel ? 'gap-2 px-4' : 'justify-center',
        )}
        title="os-camera"
      >
        <CameraLogo className="w-8 h-8 shrink-0" />
        {showLabel && (
          <span className="text-sm font-semibold text-foreground truncate">os-camera</span>
        )}
      </Link>
      <div
        className={cn(
          'flex flex-1 flex-col gap-1 py-3',
          showLabel ? 'items-stretch px-2' : 'items-center',
        )}
      >
        <MotionNotificationsBell showLabel={showLabel} />
        {items.map((item) => (
          <NavLink
            key={item.id}
            id={item.id}
            to={item.to}
            end={item.end}
            title={item.label}
            aria-label={item.label}
            className={({ isActive }) => navItemClass(isActive, showLabel)}
          >
            {item.icon}
            {showLabel && <span className="truncate text-sm">{item.label}</span>}
          </NavLink>
        ))}
        <div className="flex-1" />
        <div
          id="sidebar-bottom"
          className={cn(
            'flex flex-col gap-1 border-t border-border pt-2',
            showLabel ? 'items-stretch' : 'items-center',
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
            <ChevronLeft className={cn('h-5 w-5 shrink-0', collapsed && 'rotate-180')} />
            {showLabel && <span className="truncate text-sm">Recolher menu</span>}
          </button>
          <ConfiguracoesFlyout showLabel={showLabel} />
          <ConfiguracoesSistemaFlyout showLabel={showLabel} />
          <UserMenu showLabel={showLabel} />
        </div>
      </div>
    </nav>
  )
}
