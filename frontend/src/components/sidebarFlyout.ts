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
// um botão (mesmo padrão do `UserMenu`), fechando em clique fora. Único
// consumidor hoje é `MotionNotificationsBell`, que vive na TopBar perto do
// canto superior direito — ancorar à direita do botão (como antes, quando
// vivia no rail vertical, com espaço garantido à direita) vazaria pra fora
// da viewport aqui.
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
