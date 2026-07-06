import type { AccentColor } from '../contexts/ThemeContext'

// 'default' é o azul base atual (themes/default.css) — opção normal e
// selecionável, não só um fallback invisível (senão não haveria como voltar
// pra ele depois de escolher outro accent). Compartilhado entre
// AppearanceSettingsPage e os flyouts de sidebar (AccentSwatchNav).
export const ACCENT_OPTIONS: { value: AccentColor; label: string }[] = [
  { value: 'default', label: 'Azul' },
  { value: 'violet', label: 'Violeta' },
  { value: 'teal', label: 'Teal' },
  { value: 'coral', label: 'Coral' },
  { value: 'amber', label: 'Âmbar' },
]
