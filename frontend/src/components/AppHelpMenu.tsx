import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import { useFlyout, navItemClass } from './sidebarFlyout'
import { HelpCircle } from './Icons'

// AppHelpMenu — item "Ajuda" da TopBar (id "app-help"): botão + painel
// portalizado com um único sub-link, "Sobre" (id "about-application", →
// /settings/about) — substitui o item solo "Sobre" que antes vivia solto no
// fim do rail (Sidebar), sem cabeçalho de seção; agora é o único conteúdo
// deste dropdown. Reusa `useFlyout` (mesmo hook do MotionNotificationsBell)
// — já ancora abaixo-à-direita do gatilho, mesmo padrão de todo dropdown da
// TopBar (evita vazar pela borda direita da viewport).
export default function AppHelpMenu() {
  const { open, setOpen, pos, btnRef, panelRef, toggle } = useFlyout<HTMLButtonElement>()

  return (
    <>
      <button
        id="app-help"
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="Ajuda"
        aria-label="Ajuda"
        className={navItemClass(open, false)}
      >
        <HelpCircle className="h-5 w-5 shrink-0" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
            className="w-40 rounded-lg border border-border bg-surface py-1 shadow-xl"
          >
            <NavLink
              id="about-application"
              to="/settings/about"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-body text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              Sobre
            </NavLink>
          </div>,
          document.body,
        )}
    </>
  )
}
