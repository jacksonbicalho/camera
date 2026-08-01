import { Link } from 'react-router-dom'
import { getRole } from '../auth'
import { Button } from '@/components/ui/button'
import { Plus } from './Icons'

type Tab = 'detail' | 'motion' | 'zones' | 'analysis' | 'states'

interface Props {
  id: string
  active: Tab
}

const TABS: { key: Tab; label: string; path: (id: string) => string }[] = [
  { key: 'detail', label: 'Câmera', path: (id) => `/settings/cameras/${id}` },
  { key: 'motion', label: 'Detecção de movimento', path: (id) => `/settings/cameras/motion/${id}` },
  { key: 'zones', label: 'Zonas', path: (id) => `/settings/cameras/zones/${id}` },
  { key: 'analysis', label: 'Análise', path: (id) => `/settings/cameras/analysis/${id}` },
  { key: 'states', label: 'Estados', path: (id) => `/settings/cameras/states/${id}` },
]

export default function CameraSettingsTabs({ id, active }: Props) {
  const isAdmin = getRole() === 'admin'
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex gap-1">
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
        {isAdmin && (
          <Button asChild className="mb-1">
            <Link to="/settings/cameras/new">
              <Plus className="w-3.5 h-3.5" /> Nova câmera
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
