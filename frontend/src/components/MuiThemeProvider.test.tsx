import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useTheme as useMuiTheme } from '@mui/material/styles'
import MuiThemeProvider from './MuiThemeProvider'

let currentMode: 'dark' | 'light' | 'system' = 'dark'
vi.mock('../contexts/ThemeContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contexts/ThemeContext')>()
  return {
    ...actual,
    useTheme: () => ({ mode: currentMode, setMode: vi.fn(), theme: 'default' as const }),
  }
})

afterEach(() => {
  cleanup()
  currentMode = 'dark'
})

function PaletteModeProbe() {
  const theme = useMuiTheme()
  return <div data-testid="mui-palette-mode">{theme.palette.mode}</div>
}

function PalettePrimaryProbe() {
  const theme = useMuiTheme()
  return <div data-testid="mui-palette-primary">{theme.palette.primary.main}</div>
}

describe('MuiThemeProvider', () => {
  describe('CA2: renderiza os children e reflete o modo resolvido (dark/light) do ThemeContext do app', () => {
    it('renderiza os children normalmente', () => {
      render(
        <MuiThemeProvider>
          <div id="child-marker">conteúdo</div>
        </MuiThemeProvider>,
      )
      expect(document.getElementById('child-marker')).not.toBeNull()
    })

    it('modo "dark" do ThemeContext vira palette.mode="dark" no tema MUI', () => {
      currentMode = 'dark'
      render(
        <MuiThemeProvider>
          <PaletteModeProbe />
        </MuiThemeProvider>,
      )
      expect(screen.getByTestId('mui-palette-mode').textContent).toBe('dark')
    })

    it('modo "light" do ThemeContext vira palette.mode="light" no tema MUI', () => {
      currentMode = 'light'
      render(
        <MuiThemeProvider>
          <PaletteModeProbe />
        </MuiThemeProvider>,
      )
      expect(screen.getByTestId('mui-palette-mode').textContent).toBe('light')
    })

    it('sem --color-primary definido no ambiente (caso do jsdom/happy-dom, sem stylesheet real), cai no fallback documentado (#1976d2, "MUI primary blue 700")', () => {
      render(
        <MuiThemeProvider>
          <PalettePrimaryProbe />
        </MuiThemeProvider>,
      )
      expect(screen.getByTestId('mui-palette-primary').textContent).toBe('#1976d2')
    })
  })
})
