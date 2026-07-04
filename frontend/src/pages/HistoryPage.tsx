import { useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import CameraViewTabs from '../components/CameraViewTabs'
import { Film } from '../components/Icons'

// Lista ESTÁTICA por enquanto — a ser ligada às gravações reais (e à navegação
// para o player) numa fatia futura.
const STATIC_RECORDINGS = [
  { time: '04/07 14:32', duration: '00:42', label: 'Movimento — corredor' },
  { time: '04/07 13:10', duration: '01:05', label: 'Movimento — corredor' },
  { time: '04/07 11:58', duration: '00:18', label: 'Movimento — corredor' },
  { time: '04/07 09:24', duration: '02:11', label: 'Movimento — corredor' },
  { time: '04/07 07:47', duration: '00:33', label: 'Movimento — corredor' },
  { time: '04/07 06:02', duration: '00:57', label: 'Movimento — corredor' },
]

// HistoryPage — histórico de gravações da câmera (rota /history/:cameraId). Fatia
// inicial: grid estático de cards no estilo do Dashboard, sem dados reais.
export default function HistoryPage() {
  const { cameraId } = useParams<{ cameraId: string }>()
  return (
    <Layout id="history-page" contentClassName="p-4">
      <PageHeader
        id="history-header"
        title="Histórico"
        actions={cameraId ? <CameraViewTabs cameraId={cameraId} active="history" /> : undefined}
      />
      <div id="history-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STATIC_RECORDINGS.map((rec, i) => (
          <div
            key={i}
            id={`history-card-${i}`}
            className="overflow-hidden rounded-lg border border-border bg-surface"
          >
            <div className="relative aspect-video bg-black">
              <div className="absolute inset-0 flex items-center justify-center">
                <Film className="h-8 w-8 text-white/15" />
              </div>
              <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-caption font-medium text-white">
                {rec.duration}
              </span>
              <span className="absolute bottom-2 left-2 text-caption tabular-nums text-white/80">
                {rec.time}
              </span>
            </div>
            <div className="px-3 py-2">
              <p className="text-body font-medium text-foreground">{rec.label}</p>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  )
}
