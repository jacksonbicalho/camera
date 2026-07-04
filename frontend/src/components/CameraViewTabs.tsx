import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface CameraViewTabsProps {
  cameraId: string
  active: 'live' | 'history'
}

const base =
  'inline-flex items-center gap-1.5 rounded px-3 py-1 text-caption font-bold transition-colors'
const activeCls = 'bg-surface-2 text-foreground'
const idleCls = 'text-muted hover:bg-surface-2 hover:text-foreground'

// CameraViewTabs — menu segmentado "Ao vivo | Histórico" no topo das páginas de
// câmera (LivePage, HistoryPage). Alterna entre o ao-vivo e o histórico da mesma
// câmera; a aba ativa é marcada com aria-current. O dot da aba "Ao vivo" só pulsa
// quando ela está ativa — vira status real ("streamando agora"), não decoração.
export default function CameraViewTabs({ cameraId, active }: CameraViewTabsProps) {
  return (
    <nav
      id="camera-view-tabs"
      aria-label="Visão da câmera"
      className="inline-flex items-center gap-1 rounded-lg bg-surface p-1"
    >
      <Link
        id="camera-tab-live"
        to={`/live/${cameraId}`}
        aria-label="Ao vivo"
        aria-current={active === 'live' ? 'page' : undefined}
        className={cn(base, active === 'live' ? activeCls : idleCls)}
      >
        <span
          id="camera-tab-live-dot"
          className={cn('h-1.5 w-1.5 rounded-full bg-danger', active === 'live' && 'animate-pulse')}
        />{' '}
        Ao vivo
      </Link>
      <Link
        id="camera-tab-history"
        to={`/history/${cameraId}`}
        aria-label="Histórico"
        aria-current={active === 'history' ? 'page' : undefined}
        className={cn(base, active === 'history' ? activeCls : idleCls)}
      >
        Histórico
      </Link>
    </nav>
  )
}
