import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { clearToken, getRole, getUsername } from '../auth'
import { useUserNotifications } from '../contexts/UserNotificationContext'
import { ADMIN_SETTINGS_LINKS, VIEWER_SETTINGS_LINKS } from './settingsNavLinks'
import ThemeModeNav from './ThemeModeNav'
import AccentSwatchNav from './AccentSwatchNav'
import { BarChart2, Cctv, CircleUser, Film, Settings } from './Icons'

interface NavItem {
  id: string
  to: string
  label: string
  icon: ReactNode
  /** `/` só fica ativo na rota exata (senão casaria toda rota). */
  end?: boolean
}

const items: NavItem[] = [
  { id: 'sidebar-inicio', to: '/', label: 'Início', icon: <Cctv className="h-5 w-5" />, end: true },
  { id: 'sidebar-gravacoes', to: '/recordings', label: 'Gravações', icon: <Film className="h-5 w-5" /> },
  { id: 'sidebar-relatorios', to: '/reports', label: 'Relatórios', icon: <BarChart2 className="h-5 w-5" /> },
]

const navItemClass = (active: boolean) =>
  cn(
    'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
    active ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-2 hover:text-foreground',
  )

// useFlyout — abre/fecha um flyout posicionado (portal) à direita de um botão,
// fechando em clique fora. Compartilhado por SettingsFlyout e UserMenu — ambos no
// rodapé do rail, então o painel ancora pela BASE (bottom) do botão e cresce pra
// cima; ancorar pelo topo (como o flyout do AppSidebar, que fica mais alto na
// tela) faria o painel nascer abaixo do botão e sair da viewport.
function useFlyout<T extends HTMLElement>() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ bottom: 0, left: 0 })
  const btnRef = useRef<T>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      const inside = (panelRef.current?.contains(t) ?? false) || (btnRef.current?.contains(t) ?? false)
      if (!inside) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggle() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ bottom: window.innerHeight - r.bottom, left: r.right + 8 })
    }
    setOpen(v => !v)
  }

  return { open, setOpen, pos, btnRef, panelRef, toggle }
}

// SettingsFlyout — botão "Configurações" que abre um flyout (portal, posicionado
// à direita do botão) com o seletor de modo (dark/light/sistema, via ThemeModeNav —
// mesmo componente do AppSidebar) + as seções de settings. Sem os outros extras do
// AppSidebar (/stats): o rail enxuto fica só com o que o pedido original cobre
// (preview das seções antes de navegar).
function SettingsFlyout() {
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
        className={navItemClass(active || open)}
      >
        <Settings className="h-5 w-5" />
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
// do SettingsFlyout: Notificações, Alterar senha e Sair.
function UserMenu() {
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
        className={cn(navItemClass(open), 'relative')}
      >
        <CircleUser className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
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
            to="/change-password"
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-body text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            Alterar senha
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

// Sidebar — rail de navegação enxuto para o Layout (páginas novas). Só links +
// o flyout de Configurações: sem sino, user-menu, painéis pesados ou contextos —
// esses vivem no AppSidebar (o sidebar completo do AppLayout).
export default function Sidebar() {
  return (
    <nav
      id="sidebar"
      aria-label="Navegação"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-3"
    >
      {items.map(item => (
        <NavLink
          key={item.id}
          id={item.id}
          to={item.to}
          end={item.end}
          title={item.label}
          aria-label={item.label}
          className={({ isActive }) => navItemClass(isActive)}
        >
          {item.icon}
        </NavLink>
      ))}
      <div className="flex-1" />
      <div id="sidebar-bottom" className="flex flex-col items-center gap-1 border-t border-border pt-2">
        <SettingsFlyout />
        <UserMenu />
      </div>
    </nav>
  )
}
