import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface CameraViewTabsProps {
  cameraId: string
  active: 'live' | 'history'
}

const base =
  'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-body font-medium transition-colors'
const activeCls = 'bg-surface text-foreground ring-1 ring-border shadow-sm'
const idleCls = 'bg-transparent text-muted-foreground hover:text-foreground'

// CameraViewTabs — menu segmentado "Ao vivo | Histórico" no topo das páginas de
// câmera (LivePage, HistoryPage). Alterna entre o ao-vivo e o histórico da mesma
// câmera; a aba ativa é marcada com aria-current e vira um <span> — não um link —
// já que clicar nela de novo não levaria a lugar nenhum (já é a página atual). O
// dot da aba "Ao vivo" só fica vermelho e pulsa quando ela está ativa (cinza,
// estático, quando inativa) — vira status real ("streamando agora"), não decoração.
export default function CameraViewTabs({ cameraId, active }: CameraViewTabsProps) {
  const liveDot = (
    <span
      id="camera-tab-live-dot"
      className={cn(
        'rounded-full',
        active === 'live' ? 'h-2.5 w-2.5 animate-pulse bg-danger' : 'h-1.5 w-1.5 bg-muted-foreground',
      )}
    />
  )

  return (
    <nav
      id="camera-view-tabs"
      aria-label="Visão da câmera"
      className="inline-flex items-center gap-1 rounded-full border border-border bg-foreground/8 p-1"
    >
      {active === 'live' ? (
        <span id="camera-tab-live" aria-label="Ao vivo" aria-current="page" className={cn(base, activeCls)}>
          {liveDot} Ao vivo
        </span>
      ) : (
        <Link id="camera-tab-live" to={`/live/${cameraId}`} aria-label="Ao vivo" className={cn(base, idleCls)}>
          {liveDot} Ao vivo
        </Link>
      )}
      {active === 'history' ? (
        <span id="camera-tab-history" aria-label="Histórico" aria-current="page" className={cn(base, activeCls)}>
          Histórico
        </span>
      ) : (
        <Link id="camera-tab-history" to={`/history/${cameraId}`} aria-label="Histórico" className={cn(base, idleCls)}>
          Histórico
        </Link>
      )}
    </nav>
  )
}
