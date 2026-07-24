import { Link } from 'react-router-dom'
import { getRole } from '../auth'

type Tab = 'storage' | 'system' | 'stats' | 'reports' | 'about'

interface Props {
  active: Tab
}

interface TabDef {
  key: Tab
  label: string
  to: string
}

// Todas as abas: só o admin vê Armazenamento/Sistema (páginas admin-only,
// mesma regra de acesso que elas já aplicavam antes de virarem aba —
// ServerSettingsPage/StorageSettingsPage/SystemSettingsPage mostravam
// "Acesso restrito" pro viewer). Estatísticas/Relatórios/Sobre são visíveis
// pros dois papéis (mesma regra que "Sistema"→/settings/stats já tinha pro
// viewer antes desta história, e Relatórios nunca foi admin-only).
const ALL_TABS: TabDef[] = [
  { key: 'storage', label: 'Armazenamento', to: '/settings/storage' },
  { key: 'system', label: 'Sistema', to: '/settings/system' },
  { key: 'stats', label: 'Estatísticas', to: '/settings/stats' },
  { key: 'reports', label: 'Relatórios', to: '/settings/reports' },
  { key: 'about', label: 'Sobre', to: '/settings/about' },
]
const ADMIN_ONLY: Tab[] = ['storage', 'system']

// ServerSettingsTabs — mesmo padrão visual de CameraSettingsTabs/
// SystemSettingsTabs (que este substitui), sem breadcrumb (não há entidade
// com id — é a página "Servidor", consolidando o que antes eram
// ServerSettingsPage/StorageSettingsPage/SystemSettingsPage/StatsPage/
// AboutPage como páginas soltas). Compartilhada entre as 5 páginas.
export default function ServerSettingsTabs({ active }: Props) {
  const isAdmin = getRole() === 'admin'
  const tabs = isAdmin ? ALL_TABS : ALL_TABS.filter((t) => !ADMIN_ONLY.includes(t.key))

  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {tabs.map((tab) => (
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
