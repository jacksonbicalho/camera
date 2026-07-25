import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// navItemClass — estilo compartilhado dos itens do rail (Sidebar.tsx e componentes
// injetados nele, ex.: MotionNotificationsBell). Vive fora do Sidebar.tsx pra evitar
// import circular (Sidebar renderiza MotionNotificationsBell, que precisa deste
// helper — se ele morasse no Sidebar.tsx, o import seria circular).
export const navItemClass = (active: boolean, showLabel: boolean) =>
  cn(
    'flex items-center rounded-lg transition-colors h-10',
    showLabel ? 'w-full justify-start gap-3 px-3' : 'w-10 justify-center',
    active ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-2 hover:text-foreground',
  )

// useFlyout — abre/fecha um flyout posicionado (portal) abaixo-à-direita de
// um botão (mesmo padrão do `UserMenu`), fechando em clique fora. Usado
// pelos dropdowns da TopBar (`MotionNotificationsBell`, `AppHelpMenu`,
// `ThemeModeNav`) — todos perto do canto superior direito, onde ancorar à
// direita do botão (como fariam se ainda vivessem no rail vertical, com
// espaço garantido à direita) vazaria pra fora da viewport. Todos só-clique
// (abre no clique do gatilho, fecha no clique fora) — nenhum depende de
// `mouseenter`/`mouseleave` contínuo, o que evita uma classe inteira de bugs
// de hover em SPA: como cada página monta seu próprio `Layout` (sem layout
// aninhado de rota via `Outlet`), a `TopBar` remonta a cada navegação, e um
// `mouseenter` só dispara em resposta a movimento real do cursor — se o
// cursor já estava em repouso sobre o gatilho no instante do remount (comum,
// o usuário acabou de navegar), hover não funciona até mover o mouse pra
// fora e voltar. Bug real, reportado pelo navigator quando `ThemeModeNav`
// ainda tinha um modo hover próprio (removido por causa disso).
export function useFlyout<T extends HTMLElement>() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<T>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  return { open, setOpen, pos, btnRef, panelRef, toggle }
}
