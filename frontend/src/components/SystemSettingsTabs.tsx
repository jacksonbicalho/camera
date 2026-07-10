import { Link } from 'react-router-dom'

type Tab = 'config' | 'stats'

interface Props {
  active: Tab
}

const TABS: { key: Tab; label: string; to: string }[] = [
  { key: 'config', label: 'Configuração', to: '/settings/system' },
  { key: 'stats', label: 'Estatísticas', to: '/settings/stats' },
]

// SystemSettingsTabs — mesmo padrão visual de CameraSettingsTabs, sem
// breadcrumb (não há lista pai — é uma seção só, não uma entidade com id).
// Compartilhada entre SystemSettingsPage (/settings/system) e StatsPage
// (/settings/stats), que continuam sendo rotas/páginas próprias.
export default function SystemSettingsTabs({ active }: Props) {
  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          aria-current={active === tab.key ? 'page' : undefined}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.key
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:border-faint hover:text-foreground'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}
