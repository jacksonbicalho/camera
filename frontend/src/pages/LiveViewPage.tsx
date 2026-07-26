import { useEffect, useState } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { authHeaders, onUnauthorized } from '../auth'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import Player from '../components/Player'
import {
  defaultLayout,
  loadSavedLayout,
  saveLayout,
  mergeLayoutWithCameras,
  type TileLayout,
} from '../lib/liveViewLayout'

const ResponsiveGridLayout = WidthProvider(GridLayout)

interface Camera {
  id: string
  name: string
  live_transport?: string
}

// LiveViewPage — mostra todas as câmeras ao vivo (como AllCamerasPage/`/`), mas com layout
// CUSTOMIZÁVEL pelo usuário (arrastar/redimensionar tiles) via react-grid-layout — pedido
// explícito do navigator. Usa o subpath /legacy da lib (API v1 completa — ver comentário em
// LiveViewPage.test.tsx) por simplicidade: WidthProvider mede o container automaticamente,
// sem precisar lidar com a API v2 baseada em hooks (useContainerWidth) manualmente. O
// arranjo automático/persistência/reconciliação com a lista de câmeras vive em
// lib/liveViewLayout.ts (módulo puro, testado em isolamento). Persiste em localStorage —
// preferência de UI local, mesmo espírito de `ui-display-mode` (sidebar recolhido/expandido).
export default function LiveViewPage() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [layout, setLayout] = useState<TileLayout[]>([])

  useEffect(() => {
    fetch('/api/cameras', { headers: authHeaders() })
      .then((res) => {
        if (res.status === 401) {
          onUnauthorized()
          return []
        }
        return res.json()
      })
      .then((data: Camera[]) => {
        if (!Array.isArray(data)) return
        setCameras(data)
        const ids = data.map((c) => c.id)
        const saved = loadSavedLayout()
        setLayout(saved ? mergeLayoutWithCameras(saved, ids) : defaultLayout(ids))
      })
      .catch(() => {})
  }, [])

  // react-grid-layout entrega um array `readonly` (Layout) pro callback — copia pra um
  // array mutável antes de guardar no estado/persistir (TileLayout tem o mesmo shape).
  const handleLayoutChange = (next: readonly TileLayout[]) => {
    const copy = next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
    setLayout(copy)
    saveLayout(copy)
  }

  return (
    <Layout id="live-view-page" footerId="live-view-footer" contentClassName="p-6">
      <div id="live-view-content" className="page-content space-y-4">
        <PageHeader
          title="Live View"
          subtitle="Arraste e redimensione os cards pra customizar o layout."
        />
        {cameras.length === 0 ? (
          <p id="live-view-empty" className="text-faint text-body">
            Nenhuma câmera configurada.
          </p>
        ) : (
          // ResponsiveGridLayout (react-grid-layout/legacy) não aceita `id` como prop —
          // envolve num wrapper próprio pra manter a convenção de id estável em todo
          // elemento de UI (CLAUDE.md).
          <div id="live-view-grid">
            <ResponsiveGridLayout
              className="layout"
              layout={layout}
              cols={12}
              rowHeight={30}
              onLayoutChange={handleLayoutChange}
            >
              {cameras.map((cam) => (
                <div
                  key={cam.id}
                  id={`live-view-tile-${cam.id}`}
                  className="overflow-hidden rounded-lg border border-border bg-surface"
                >
                  <Player
                    id={`player-${cam.id}`}
                    src={`/stream/${cam.id}/index.m3u8`}
                    className="absolute inset-0 h-full w-full object-cover bg-black"
                    containerClassName="relative h-full"
                    cameraId={cam.id}
                    transport={cam.live_transport}
                    title={cam.name}
                  />
                </div>
              ))}
            </ResponsiveGridLayout>
          </div>
        )}
      </div>
    </Layout>
  )
}
