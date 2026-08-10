import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import { authHeaders } from '../../auth'

interface CameraOption {
  id: string
  name: string
}

// StatesLandingPage — rota "/settings/states" (sem :id): Estados é por
// câmera (CameraStatesSettingsPage.tsx, /settings/states/:id), então esta
// página só existe pra resolver QUAL câmera abrir antes de entrar de fato —
// mesmo padrão de HistoryLandingPage (nunca mostra um
// picker, navega direto pra 1ª câmera assim que a lista carrega). Trocar de
// câmera depois é via o <select> dentro da própria CameraStatesSettingsPage.
// `replace: true` pra não empilhar "/settings/states" no histórico.
export default function StatesLandingPage() {
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
      navigate(`/settings/states/${cameras[0].id}`, { replace: true })
  }, [cameras, navigate])

  return (
    <SettingsLayout id="states-landing-page" footerId="states-landing-footer">
      <PageHeader title="Estados" />
      {cameras === null ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : cameras.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma câmera disponível.</p>
      ) : null}
    </SettingsLayout>
  )
}
