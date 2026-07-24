import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { authHeaders } from '../auth'
import { Cctv } from '../components/Icons'

interface CameraOption {
  id: string
  name: string
}

// HistoryLandingPage — rota "/history" (sem :cameraId): Histórico é por
// câmera (HistoryPage.tsx, /history/:cameraId), então esta página só
// existe pra escolher qual — substitui o antigo flyout de câmera do rail
// (pedido do navigator: sem sub-menu no Sidebar, o seletor vive na própria
// página). Escolher uma câmera navega direto pra /history/:cameraId. Só
// existindo 1 câmera, pula o picker inteiramente (pedido do navigator: não
// tem escolha real pra fazer) — `replace: true` pra não empilhar
// "/history" no histórico do navegador (o usuário nunca chega a VER a lista
// de 1 item, então não deveria voltar pra ela no botão "voltar").
export default function HistoryLandingPage() {
  const navigate = useNavigate()
  const [cameras, setCameras] = useState<CameraOption[] | null>(null)

  useEffect(() => {
    fetch('/api/cameras', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: CameraOption[]) => setCameras(list))
      .catch(() => setCameras([]))
  }, [])

  useEffect(() => {
    if (cameras?.length === 1) navigate(`/history/${cameras[0].id}`, { replace: true })
  }, [cameras, navigate])

  return (
    <Layout id="history-landing-page" footerId="history-landing-footer" contentClassName="p-6">
      <div id="history-landing-content" className="page-content space-y-4">
        <PageHeader
          title="Histórico"
          subtitle="Escolha uma câmera para ver o histórico de gravações."
        />
        {cameras === null ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : cameras.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma câmera disponível.</p>
        ) : (
          <div
            id="history-landing-cameras"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
          >
            {cameras.map((c) => (
              <button
                key={c.id}
                id={`history-landing-camera-${c.id}`}
                type="button"
                onClick={() => navigate(`/history/${c.id}`)}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-2"
              >
                <Cctv className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
