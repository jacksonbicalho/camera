import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import { authHeaders } from '../auth'

interface CameraOption {
  id: string
  name: string
}

// HistoryLandingPage — rota "/history" (sem :cameraId): Histórico é por
// câmera (HistoryPage.tsx, /history/:cameraId), então esta página só existe
// pra resolver QUAL câmera abrir antes de entrar de fato no Histórico —
// substitui o antigo flyout de câmera do rail (pedido do navigator: sem
// sub-menu no Sidebar). Nunca mostra um picker: assim que a lista de
// câmeras carrega, navega direto pra `/history/<1ª câmera>` — mesmo
// comportamento com 1 câmera ou com N ("o charme é quando tiver apenas uma
// câmera, já abre com ela selecionada" — generalizado pra sempre abrir
// direto). Trocar de câmera depois é via o `<select>` dentro da própria
// `HistoryPage` (mesmo padrão do `report-camera-select` em `ReportsPage`),
// não voltando pra cá. `replace: true` pra não empilhar "/history" no
// histórico do navegador (o usuário nunca chega a VER esta página de
// verdade, só passa por ela).
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
    if (cameras && cameras.length > 0) navigate(`/history/${cameras[0].id}`, { replace: true })
  }, [cameras, navigate])

  return (
    <Layout id="history-landing-page" footerId="history-landing-footer" contentClassName="p-6">
      <div id="history-landing-content" className="page-content space-y-4">
        <PageHeader title="Histórico" />
        {cameras === null ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : cameras.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma câmera disponível.</p>
        ) : null}
      </div>
    </Layout>
  )
}
