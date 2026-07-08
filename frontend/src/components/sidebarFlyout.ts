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

// useFlyout — abre/fecha um flyout posicionado (portal) à direita de um botão,
// fechando em clique fora. `pos` traz as duas âncoras possíveis: SettingsFlyout e
// UserMenu (rodapé do rail) usam `bottom` — o painel ancora pela BASE do botão e
// cresce pra cima, senão nasceria abaixo do botão e sairia da viewport; itens do
// nav principal (ex.: CameraListFlyout, MotionNotificationsBell) usam `top` — ancora
// pelo TOPO do botão e cresce pra baixo (mesmo padrão do flyout de dropdown do
// AppSidebar).
export function useFlyout<T extends HTMLElement>() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, bottom: 0, left: 0 })
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
      setPos({ top: r.top, bottom: window.innerHeight - r.bottom, left: r.right + 8 })
    }
    setOpen(v => !v)
  }

  return { open, setOpen, pos, btnRef, panelRef, toggle }
}
