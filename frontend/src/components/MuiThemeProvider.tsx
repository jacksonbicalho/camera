import { useMemo, type ReactNode } from 'react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { useTheme, resolveMode } from '../contexts/ThemeContext'

// Fallback quando --color-primary não está definido no elemento raiz (ex.: ambiente de
// teste, sem stylesheet real carregado) — mesmo valor default de themes/default.css
// ("MUI primary (blue 700)"), então mesmo o fallback já combina com o resto do app.
const DEFAULT_PRIMARY = '#1976d2'

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

// MuiThemeProvider — EXCEÇÃO deliberada ao padrão Tailwind-only do app (ver CLAUDE.md):
// só existe pro TimePicker do filtro de horário do Histórico (dial de relógio, pedido do
// navigator), que precisa do MUI X. Não é montado globalmente em App.tsx — só embrulha os
// componentes que genuinamente usam MUI por baixo (ver TimeRangeFilterPanel), mantendo o
// resto do app livre da dependência. Mapeia o `mode` resolvido do ThemeContext do app
// (dark/light) e o token `--color-primary` já existente pro tema do MUI, em vez de duplicar
// paleta/cor.
export default function MuiThemeProvider({ children }: { children: ReactNode }) {
  const { mode } = useTheme()
  const resolved = resolveMode(mode)

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: resolved,
          primary: { main: readCssVar('--color-primary', DEFAULT_PRIMARY) },
        },
      }),
    [resolved],
  )

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
