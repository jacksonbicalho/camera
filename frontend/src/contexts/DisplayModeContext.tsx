/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'

// Só 2 modos: um rail de navegação enxuto não comporta um modo "só texto, sem
// ícone" (os ícones são o ponto do rail recolhido) — ver Sidebar.tsx.
export type DisplayMode = 'icons-only' | 'icons-text'

export interface DisplayModeState {
  sidebar: DisplayMode
}

type SetDisplayMode = (section: keyof DisplayModeState, mode: DisplayMode) => void

const STORAGE_KEY = 'ui-display-mode'
const DEFAULT: DisplayModeState = { sidebar: 'icons-only' }

function load(): DisplayModeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw)
    return {
      sidebar: parsed.sidebar ?? DEFAULT.sidebar,
    }
  } catch {
    return DEFAULT
  }
}

const DisplayModeContext = createContext<DisplayModeState>(DEFAULT)
const SetDisplayModeContext = createContext<SetDisplayMode>(() => {})

export function DisplayModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DisplayModeState>(load)

  function set(section: keyof DisplayModeState, mode: DisplayMode) {
    setState((prev) => {
      const next = { ...prev, [section]: mode }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <SetDisplayModeContext.Provider value={set}>
      <DisplayModeContext.Provider value={state}>{children}</DisplayModeContext.Provider>
    </SetDisplayModeContext.Provider>
  )
}

export function useDisplayMode(): DisplayModeState {
  return useContext(DisplayModeContext)
}

export function useSetDisplayMode(): SetDisplayMode {
  return useContext(SetDisplayModeContext)
}
