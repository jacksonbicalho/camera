import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { authHeaders, clearToken, getRole, getUsername } from '../auth'
import { useUserNotifications } from '../contexts/UserNotificationContext'
import { useDisplayMode, useSetDisplayMode } from '../contexts/DisplayModeContext'
import { ADMIN_SETTINGS_LINKS, VIEWER_SETTINGS_LINKS } from './settingsNavLinks'
import ThemeModeNav from './ThemeModeNav'
import AccentSwatchNav from './AccentSwatchNav'
import MotionNotificationsBell from './MotionNotificationsBell'
import { navItemClass, useFlyout } from './sidebarFlyout'
import { BarChart2, CameraLogo, Cctv, ChevronLeft, CircleUser, Film, Settings } from './Icons'

interface NavItem {
  id: string
  to: string
  label: string
  icon: ReactNode
  /** `/` só fica ativo na rota exata (senão casaria toda rota). */
  end?: boolean
}

const items: NavItem[] = [
  { id: 'sidebar-all-cameras', to: '/', label: 'Todas as câmeras', icon: <Cctv className="h-5 w-5" />, end: true },
]

interface CameraOption { id: string; name: string }

interface CameraListFlyoutProps {
  id: string
  label: string
  icon: ReactNode
  showLabel: boolean
  /** Prefixo de rota que acende o botão como ativo (ex.: "/reports"). */
  activePrefix: string
  /** Constrói a URL de destino a partir do id da câmera clicada. */
  buildTarget: (cameraId: string) => string
}

// CameraListFlyout — botão do nav principal que abre um flyout (mesmo mecanismo do
// SettingsFlyout, ancorado pelo TOPO — ver useFlyout) com a lista de câmeras do
// usuário; clicar numa câmera navega pro destino calculado por `buildTarget`.
// Reaproveitado por "Relatórios" e "Gravações" — mesmo estilo de submenu pros dois,
// só muda o destino da navegação.
function CameraListFlyout({ id, label, icon, showLabel, activePrefix, buildTarget }: CameraListFlyoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { open, setOpen, pos, btnRef, panelRef, toggle } = useFlyout<HTMLButtonElement>()
  const [cameras, setCameras] = useState<CameraOption[]>([])
  const active = location.pathname.startsWith(activePrefix)

  useEffect(() => {
    if (!open) return
    fetch('/api/cameras', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((list: CameraOption[]) => setCameras(list))
      .catch(() => {})
  }, [open])

  function selectCamera(cameraId: string) {
    setOpen(false)
    navigate(buildTarget(cameraId))
  }

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
      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-48 rounded-lg border border-border bg-surface py-1 shadow-xl"
        >
          {cameras.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-faint">Nenhuma câmera</p>
          ) : (
            cameras.map(c => (
              <button
                key={c.id}
                id={`${id}-camera-${c.id}`}
                type="button"
                onClick={() => selectCamera(c.id)}
                className="block w-full truncate px-3 py-1.5 text-left text-body text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {c.name}
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function ReportsFlyout({ showLabel }: { showLabel: boolean }) {
  return (
    <CameraListFlyout
      id="sidebar-relatorios"
      label="Relatórios"
      icon={<BarChart2 className="h-5 w-5 shrink-0" />}
      showLabel={showLabel}
      activePrefix="/reports"
      buildTarget={cameraId => `/reports/${cameraId}/${format(new Date(), 'yyyy-MM-dd')}/1`}
    />
  )
}

// RecordingsFlyout — "Gravações" segue o mesmo estilo de submenu de "Relatórios"
// (pedido do navigator): lista de câmeras → histórico da câmera clicada
// (/history/:cameraId, a página nova por câmera — ver routes.tsx/newRoutes),
// em vez do link direto pro /recordings global.
function RecordingsFlyout({ showLabel }: { showLabel: boolean }) {
  return (
    <CameraListFlyout
      id="sidebar-gravacoes"
      label="Gravações"
      icon={<Film className="h-5 w-5 shrink-0" />}
      showLabel={showLabel}
      activePrefix="/history"
      buildTarget={cameraId => `/history/${cameraId}`}
    />
  )
}

// SettingsFlyout — botão "Configurações" que abre um flyout (portal, posicionado
// à direita do botão) com o seletor de modo (dark/light/sistema, via ThemeModeNav —
// mesmo componente do AppSidebar) + as seções de settings. Sem os outros extras do
// AppSidebar (/stats): o rail enxuto fica só com o que o pedido original cobre
// (preview das seções antes de navegar).
function SettingsFlyout({ showLabel }: { showLabel: boolean }) {
  const location = useLocation()
  const { open, setOpen, pos, btnRef, panelRef, toggle } = useFlyout<HTMLButtonElement>()
  const active = location.pathname.startsWith('/settings')
  const links = getRole() === 'admin' ? ADMIN_SETTINGS_LINKS : VIEWER_SETTINGS_LINKS

  return (
    <>
      <button
        id="sidebar-config"
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Configurações"
        aria-label="Configurações"
        className={navItemClass(active || open, showLabel)}
      >
        <Settings className="h-5 w-5 shrink-0" />
        {showLabel && <span className="truncate text-sm">Configurações</span>}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', bottom: pos.bottom, left: pos.left, zIndex: 9999 }}
          className="w-48 rounded-lg border border-border bg-surface py-1 shadow-xl"
        >
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'block px-3 py-1.5 text-body transition-colors',
                  isActive
                    ? 'bg-surface-2 text-foreground'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )
              }
            >
              {label}
            </NavLink>
          ))}
          <ThemeModeNav onSelect={() => setOpen(false)} />
          <AccentSwatchNav onSelect={() => setOpen(false)} />
        </div>,
        document.body,
      )}
    </>
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
      {open && createPortal(
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

// Sidebar — rail de navegação enxuto para o Layout (páginas novas). Links + recolher/expandir
// (mesmo DisplayModeContext global do AppSidebar — só 2 dos 3 modos, não faz sentido
// "text-only" pra um rail de 3 itens; se o usuário estiver em "text-only", tratamos como
// expandido e o botão de recolher força de volta pra "icons-only") + flyout de Configurações +
// UserMenu: sem sino/painéis pesados — esses vivem no AppSidebar (o sidebar completo do
// AppLayout).
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
        className={cn('flex items-center h-14 hover:opacity-80 transition-opacity border-b border-border flex-none', showLabel ? 'gap-2 px-4' : 'justify-center')}
        title="os-camera"
      >
        <CameraLogo className="w-8 h-8 shrink-0" />
        {showLabel && <span className="text-sm font-semibold text-foreground truncate">os-camera</span>}
      </Link>
      <div className={cn('flex flex-1 flex-col gap-1 py-3', showLabel ? 'items-stretch px-2' : 'items-center')}>
        <MotionNotificationsBell showLabel={showLabel} />
        {items.map(item => (
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
        <RecordingsFlyout showLabel={showLabel} />
        <ReportsFlyout showLabel={showLabel} />
        <div className="flex-1" />
        <div
          id="sidebar-bottom"
          className={cn('flex flex-col gap-1 border-t border-border pt-2', showLabel ? 'items-stretch' : 'items-center')}
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
          <SettingsFlyout showLabel={showLabel} />
          <UserMenu showLabel={showLabel} />
        </div>
      </div>
    </nav>
  )
}
