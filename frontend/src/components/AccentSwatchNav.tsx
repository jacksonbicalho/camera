import { useTheme } from '../contexts/ThemeContext'
import { ACCENT_OPTIONS } from './accentOptions'
import { Check } from './Icons'

// AccentSwatchNav — seletor visual de cor de destaque para os flyouts de sidebar
// (AppSidebar/Sidebar), ao lado do ThemeModeNav. Swatches (não lista de texto,
// diferente do ThemeModeNav) porque cor é melhor reconhecida vendo a cor em si —
// cada bolinha mostra a própria cor via `data-accent` escopado no próprio botão
// (mesmo truque do AccentSwatchGroup em AppearanceSettingsPage): `var(--color-primary)`
// resolve pro accent daquele elemento, sem afetar o resto da página. Isso vale
// inclusive pro accent "default" — accents.css tem um bloco [data-accent="default"]
// só pra esse escopo local (nunca aplicado no <html>).
export default function AccentSwatchNav({ onSelect }: { onSelect?: () => void }) {
  const { accent, setAccent } = useTheme()

  return (
    <div id="accent-swatch-nav" className="border-t border-border px-3 py-2">
      <p className="mb-1.5 text-caption text-muted-foreground">Cor de destaque</p>
      <div role="radiogroup" aria-label="Cor de destaque" className="flex gap-2">
        {ACCENT_OPTIONS.map((opt) => {
          const checked = accent === opt.value
          return (
            <button
              key={opt.value}
              id={`accent-swatch-${opt.value}`}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={opt.label}
              data-accent={opt.value}
              onClick={() => {
                setAccent(opt.value)
                onSelect?.()
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {checked && <Check className="h-3 w-3 text-on-primary" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
