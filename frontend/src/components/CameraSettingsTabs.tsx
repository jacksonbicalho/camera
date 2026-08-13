import { Link } from 'react-router-dom'

type Tab = 'detail' | 'zones'

interface Props {
  id: string
  active: Tab
}

const TABS: { key: Tab; label: string; path: (id: string) => string }[] = [
  { key: 'detail', label: 'Câmera', path: (id) => `/settings/cameras/${id}` },
  { key: 'zones', label: 'Zonas', path: (id) => `/settings/cameras/zones/${id}` },
]

export default function CameraSettingsTabs({ id, active }: Props) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tab.path(id)}
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
