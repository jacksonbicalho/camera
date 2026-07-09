import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authHeaders, onUnauthorized, getRole } from '../auth'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import Player from '../components/Player'

interface Camera {
  id: string
  name: string
  live_transport?: string
}

// gridColumns — número de colunas do "video wall" em função da quantidade de
// câmeras: 1 câmera ocupa a página quase inteira (1 coluna), 2 dividem a página
// ao meio (2 colunas), daí em diante cresce em raiz quadrada (3–4 → 2 colunas
// em 2 linhas, 5–9 → 3 colunas, ...) — mesmo padrão de grade usado em telas de
// monitoramento multi-câmera.
function gridColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count)))
}

// AllCamerasPage — página nova (método estrangulamento) que assume o papel de
// "todas as câmeras" antes coberto pela DashboardPage legada: grid com preview
// ao vivo de cada câmera, clique navega pro live novo (/live/:cameraId). Usa
// só os componentes novos de layout/player, nada do chrome/player legados. Rota: "/".
export default function AllCamerasPage() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/cameras', { headers: authHeaders() })
      .then((res) => {
        if (res.status === 401) {
          onUnauthorized()
          return []
        }
        return res.json()
      })
      .then((data) => {
        if (!Array.isArray(data)) return
        if (data.length === 0 && getRole() === 'admin') {
          navigate('/settings/cameras/new', { replace: true })
          return
        }
        setCameras(data)
      })
  }, [navigate])

  return (
    <Layout id="all-cameras-page" footerId="all-cameras-footer" contentClassName="p-6">
      <div id="all-cameras-content" className="page-content space-y-4">
        <PageHeader id="all-cameras-header" title="Todas as câmeras" />
        {cameras.length === 0 ? (
          <p id="all-cameras-empty" className="text-faint text-body">
            Nenhuma câmera configurada.
          </p>
        ) : (
          <div
            id="all-cameras-grid"
            className="grid min-h-[70vh] auto-rows-fr gap-4"
            style={{
              gridTemplateColumns: `repeat(${gridColumns(cameras.length)}, minmax(0, 1fr))`,
            }}
          >
            {cameras.map((cam) => (
              <button
                key={cam.id}
                id={`all-cameras-card-${cam.id}`}
                onClick={() => navigate(`/live/${cam.id}`)}
                className="group flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-primary"
              >
                <div className="relative min-h-0 flex-1">
                  <Player
                    src={`/stream/${cam.id}/index.m3u8`}
                    className="absolute inset-0 h-full w-full object-cover bg-black pointer-events-none"
                    containerClassName="absolute inset-0 h-full w-full pointer-events-none"
                    cameraId={cam.id}
                    transport={cam.live_transport}
                  />
                  <span className="absolute top-2 left-2 bg-danger text-white text-caption px-2 py-0.5 rounded font-medium">
                    AO VIVO
                  </span>
                </div>
                <div className="shrink-0 px-3 py-2">
                  <p className="text-body font-medium text-foreground group-hover:text-foreground truncate">
                    {cam.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
