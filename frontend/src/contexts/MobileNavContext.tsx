/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

// MobileNavContext — abre/fecha o drawer off-canvas da Sidebar em telas
// estreitas (<lg), acionado pelo hamburguer da TopBar. Mesmo espírito de
// Context de estado de exibição já usado por DisplayModeContext.tsx: contexto
// com valor DEFAULT (não `null`), então consumir sem Provider nunca lança —
// só se comporta como "sempre fechado, toggle/close no-op". Diferente de
// DisplayModeContext, não persiste em localStorage: o drawer sempre começa
// fechado a cada carga de página.
interface MobileNavState {
  open: boolean
  toggle: () => void
  close: () => void
}

const DEFAULT: MobileNavState = { open: false, toggle: () => {}, close: () => {} }

const MobileNavContext = createContext<MobileNavState>(DEFAULT)

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const value = useMemo<MobileNavState>(
    () => ({
      open,
      toggle: () => setOpen((v) => !v),
      close: () => setOpen(false),
    }),
    [open],
  )
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>
}

export function useMobileNav(): MobileNavState {
  return useContext(MobileNavContext)
}
