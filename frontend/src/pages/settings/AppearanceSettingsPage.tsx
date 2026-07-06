import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import { Check } from '../../components/Icons'
import { useDisplayMode, useSetDisplayMode, type DisplayMode } from '../../contexts/DisplayModeContext'
import { useTheme, type Mode, type AccentColor } from '../../contexts/ThemeContext'
import { ACCENT_OPTIONS } from '../../components/accentOptions'

const THEME_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Sistema' },
]

function AccentSwatchGroup({
  value,
  onChange,
}: {
  value: AccentColor
  onChange: (a: AccentColor) => void
}) {
  return (
    <div role="radiogroup" aria-label="Cor de destaque" className="flex gap-3 flex-wrap">
      {ACCENT_OPTIONS.map(opt => {
        const checked = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={opt.label}
            data-accent={opt.value === 'default' ? undefined : opt.value}
            onClick={() => onChange(opt.value)}
            className="flex h-9 w-9 items-center justify-center rounded-full cursor-pointer"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {checked && <Check className="h-4 w-4 text-on-primary" />}
          </button>
        )
      })}
    </div>
  )
}

const OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: 'icons-only', label: 'Apenas ícones' },
  { value: 'icons-text', label: 'Ícones e textos' },
  { value: 'text-only',  label: 'Apenas textos' },
]

function ModeRadioGroup({
  value,
  onChange,
}: {
  value: DisplayMode
  onChange: (v: DisplayMode) => void
}) {
  return (
    <div className="flex gap-3 flex-wrap">
      {OPTIONS.map(opt => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none group">
          <input
            type="radio"
            name={undefined}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary cursor-pointer"
          />
          <span className="text-sm text-foreground group-hover:text-white transition-colors">
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  )
}

export default function AppearanceSettingsPage() {
  const mode = useDisplayMode()
  const set = useSetDisplayMode()
  const { mode: colorMode, setMode, accent, setAccent } = useTheme()

  return (
    <SettingsLayout>
      <PageHeader size="section" title="Aparência" subtitle="Controla como botões e rótulos são exibidos na interface." />

      <div className="flex flex-col gap-6">
        <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Estilo</p>
            <p className="text-xs text-muted-foreground mt-0.5">Esquema de cores da interface.</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {THEME_OPTIONS.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="radio"
                  checked={colorMode === opt.value}
                  onChange={() => setMode(opt.value)}
                  className="accent-primary cursor-pointer"
                />
                <span className="text-sm text-foreground group-hover:text-white transition-colors">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Cor de destaque</p>
            <p className="text-xs text-muted-foreground mt-0.5">Cor dos botões, links e foco de campos.</p>
          </div>
          <AccentSwatchGroup value={accent} onChange={setAccent} />
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Sidebar</p>
            <p className="text-xs text-muted-foreground mt-0.5">Botões e itens da barra lateral esquerda.</p>
          </div>
          <ModeRadioGroup value={mode.sidebar} onChange={v => set('sidebar', v)} />
        </div>

        <div className="bg-surface border border-border rounded-lg p-5 flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Topo do player</p>
            <p className="text-xs text-muted-foreground mt-0.5">Controles acima do vídeo (mudo, velocidade, gravações…).</p>
          </div>
          <ModeRadioGroup value={mode.player} onChange={v => set('player', v)} />
        </div>
      </div>
    </SettingsLayout>
  )
}
