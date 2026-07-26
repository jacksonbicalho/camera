import { useCallback, useEffect, useRef, useState } from 'react'
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
  presetLayout,
  loadSavedCols,
  saveCols,
  DEFAULT_COLS,
  LAYOUT_PRESETS,
  type TileLayout,
} from '../lib/liveViewLayout'

const ResponsiveGridLayout = WidthProvider(GridLayout)

// Câmeras de vídeo são tipicamente 16:9 — mesma proporção já usada em `aspect-video`
// (VideoPlayer.tsx). Uma célula 1×1 do grid mantém essa proporção, então a câmera aparece
// sem cortar/distorcer quando ocupa 1 célula só (pedido do navigator, com mockup de
// referência: dividir o espaço em quadros proporcionais, não um `rowHeight` fixo
// independente da largura real do container).
const CELL_ASPECT_RATIO = 9 / 16

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
//
// Botões de preset (1×1/2×2/3×3/4×4) resetam TODAS as câmeras pra 1 célula cada, na ordem —
// "definir o menor quadro possível e distribuir pelo espaço disponível" (pedido do
// navigator) — e trocam `cols`, que junto com a largura medida do container determina o
// `rowHeight` proporcional (16:9). Redimensionar manualmente um tile (arrastar a borda)
// continua livre e não é travado pra múltiplos NxN — os presets cobrem o caso comum
// (arranjo simétrico); ver `## Revisão` da story pra esse escopo.
export default function LiveViewPage() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [layout, setLayout] = useState<TileLayout[]>([])
  const [cols, setCols] = useState<number>(() => loadSavedCols() ?? DEFAULT_COLS)
  const [containerWidth, setContainerWidth] = useState(1200)
  const gridWrapObserverRef = useRef<ResizeObserver | null>(null)

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

  // Mede a largura real do container pra computar um rowHeight proporcional (16:9) — mesmo
  // padrão de HistoryPage.tsx (mainRef/ResizeObserver): ref callback (não useRef+useEffect
  // vazio, já que o elemento só existe depois que `cameras` carrega) + guard porque
  // ResizeObserver não existe no jsdom dos testes (degrada pro valor inicial). `useCallback`
  // + desconectar o observer anterior antes de criar um novo evita empilhar observers a
  // cada re-render (a função seria recriada — e um novo ResizeObserver instanciado — em
  // todo render sem isso, já que React reexecuta ref callbacks quando a identidade muda).
  const bindGridWrap = useCallback((node: HTMLDivElement | null) => {
    gridWrapObserverRef.current?.disconnect()
    gridWrapObserverRef.current = null
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(w)
    })
    observer.observe(node)
    gridWrapObserverRef.current = observer
  }, [])

  const rowHeight = (containerWidth / cols) * CELL_ASPECT_RATIO

  // react-grid-layout entrega um array `readonly` (Layout) pro callback — copia pra um
  // array mutável antes de guardar no estado/persistir (TileLayout tem o mesmo shape).
  const handleLayoutChange = (next: readonly TileLayout[]) => {
    const copy = next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
    setLayout(copy)
    saveLayout(copy)
  }

  const applyPreset = (n: number) => {
    setCols(n)
    saveCols(n)
    const next = presetLayout(
      cameras.map((c) => c.id),
      n,
    )
    setLayout(next)
    saveLayout(next)
  }

  return (
    <Layout id="live-view-page" footerId="live-view-footer" contentClassName="p-6">
      <div id="live-view-content" className="page-content space-y-4">
        <PageHeader
          title="Live View"
          subtitle="Arraste e redimensione os cards pra customizar o layout."
          actions={
            <div id="live-view-presets" className="flex items-center gap-1.5">
              {LAYOUT_PRESETS.map((n) => (
                <button
                  key={n}
                  id={`live-view-preset-${n}x${n}`}
                  type="button"
                  onClick={() => applyPreset(n)}
                  className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                    cols === n
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-surface-2 text-muted border-border hover:text-foreground'
                  }`}
                >
                  {n}×{n}
                </button>
              ))}
            </div>
          }
        />
        {cameras.length === 0 ? (
          <p id="live-view-empty" className="text-faint text-body">
            Nenhuma câmera configurada.
          </p>
        ) : (
          // ResponsiveGridLayout (react-grid-layout/legacy) não aceita `id` como prop —
          // envolve num wrapper próprio pra manter a convenção de id estável em todo
          // elemento de UI (CLAUDE.md).
          <div id="live-view-grid" ref={bindGridWrap}>
            <ResponsiveGridLayout
              className="layout"
              layout={layout}
              cols={cols}
              rowHeight={rowHeight}
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
                    controls
                  >
                    <span className="absolute top-2 left-2 bg-danger text-white text-caption px-2 py-0.5 rounded font-medium pointer-events-none">
                      AO VIVO
                    </span>
                  </Player>
                </div>
              ))}
            </ResponsiveGridLayout>
          </div>
        )}
      </div>
    </Layout>
  )
}
