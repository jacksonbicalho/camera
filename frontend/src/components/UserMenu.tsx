import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { clearToken, getRole, getUsername } from '../auth'
import { useUserNotifications } from '../contexts/UserNotificationContext'
import { CircleUser } from './Icons'

// UserMenu — avatar do usuário logado. Antes vivia no rodapé do rail e o
// flyout, ancorado perto do fundo da viewport, saía da tela em telas curtas
// (nenhum outro item do rail tinha esse problema, só este); depois virou
// `position: fixed` solto no canto superior direito, mas colidia
// visualmente com botões de ação dos `PageHeader` (`.page-content` fluido
// deixa esses botões correrem até a borda da viewport). Hoje renderiza EM
// FLUXO dentro da `TopBar` (barra full-width fixa no topo, ver
// `TopBar.tsx`) — tem um lugar próprio reservado pra ele, sem colidir com
// nada e sem sair da tela (a barra em si é sempre visível).
export default function UserMenu() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const { unreadCount } = useUserNotifications()
  const username = getUsername() ?? 'usuário'
  const roleLabel = getRole() === 'admin' ? 'Administrador' : 'Visualizador'

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      const inside =
        (panelRef.current?.contains(t) ?? false) || (btnRef.current?.contains(t) ?? false)
      if (!inside) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggle() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
    setOpen((v) => !v)
  }

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
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <span className="relative inline-flex shrink-0">
          <CircleUser className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
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
