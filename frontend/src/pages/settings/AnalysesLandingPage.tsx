import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import { authHeaders } from '../../auth'

interface CameraOption {
  id: string
  name: string
}

// AnalysesLandingPage — rota "/settings/analyses" (sem :id): Análise é por
// câmera (CameraAnalysisSettingsPage.tsx, /settings/analyses/:id), então esta
// página só existe pra resolver QUAL câmera abrir antes de entrar de fato —
// mesmo padrão de HistoryLandingPage (nunca mostra um picker, navega direto
// pra 1ª câmera assim que a lista carrega). Trocar de câmera depois é via o
// <select> dentro da própria CameraAnalysisSettingsPage (análogo ao
// report-camera-select da ReportsPage), não voltando pra cá. `replace: true`
// pra não empilhar "/settings/analyses" no histórico do navegador.
export default function AnalysesLandingPage() {
  const navigate = useNavigate()
  const [cameras, setCameras] = useState<CameraOption[] | null>(null)

  useEffect(() => {
    fetch('/api/cameras', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: CameraOption[]) => setCameras(list))
      .catch(() => setCameras([]))
  }, [])

  useEffect(() => {
    if (cameras && cameras.length > 0)
      navigate(`/settings/analyses/${cameras[0].id}`, { replace: true })
  }, [cameras, navigate])

  return (
    <SettingsLayout id="analyses-landing-page" footerId="analyses-landing-footer">
      <PageHeader title="Análise por câmera" />
      {cameras === null ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : cameras.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma câmera disponível.</p>
      ) : null}
    </SettingsLayout>
  )
}
