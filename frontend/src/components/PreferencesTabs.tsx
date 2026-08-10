import { Link } from 'react-router-dom'

type Tab = 'extensions' | 'appearance'

interface Props {
  active: Tab
}

// A lista existe pra deixar explícito que "Preferências" é um pai com
// sub-itens, não um link solto. Adicionar uma aba nova é só uma entrada a
// mais aqui, mesmo padrão de CameraSettingsTabs (Câmera/Zonas).
const TABS: { key: Tab; label: string; path: string }[] = [
  { key: 'extensions', label: 'Extensões', path: '/settings/preferences/extensions' },
  { key: 'appearance', label: 'Aparência', path: '/settings/preferences/appearance' },
]

export default function PreferencesTabs({ active }: Props) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tab.path}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-faint'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
