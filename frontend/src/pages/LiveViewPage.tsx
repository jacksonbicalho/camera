import { useCallback, useEffect, useRef, useState } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { authHeaders, onUnauthorized } from '../auth'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import Player from '../components/Player'
import { Button } from '@/components/ui/button'
import {
  defaultLayout,
  loadSavedLayout,
  saveLayout,
  mergeLayoutWithCameras,
  presetLayout,
  loadSavedCols,
  saveCols,
  computeRowHeight,
  DEFAULT_COLS,
  LAYOUT_PRESETS,
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
//
// Botões de preset (1×1/2×2/3×3/4×4 + "Mais" pra um N customizado) resetam TODAS as câmeras
// pra 1 célula cada, na ordem — "definir o menor quadro possível e distribuir pelo espaço
// disponível" (pedido do navigator) — e trocam `cols`. Preset "NxN" é uma grade REAL de N
// linhas × N colunas: `rowHeight` vem de `computeRowHeight` (altura da viewport disponível
// dividida pelas linhas), não da largura da coluna — um preset 1×1 preenche a altura
// disponível inteira numa única célula, 4×4 divide essa mesma altura em 4 linhas, sem exigir
// scroll pra ver todas as linhas do preset escolhido (feedback do navigator: o cálculo
// anterior, baseado só na largura, gerava células "grandes demais" nesse sentido).
// Redimensionar manualmente um tile (arrastar a borda) continua livre e não é travado pra
// múltiplos NxN — os presets cobrem o caso comum (arranjo simétrico); ver `## Revisão` da
// story pra esse escopo.
export default function LiveViewPage() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [layout, setLayout] = useState<TileLayout[]>([])
  const [cols, setCols] = useState<number>(() => loadSavedCols() ?? DEFAULT_COLS)
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  )
  const [gridTop, setGridTop] = useState(0)
  const gridWrapRef = useRef<HTMLDivElement | null>(null)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customValue, setCustomValue] = useState('')

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

  // Mede o topo do grid (distância até o topo da viewport) pra computeRowHeight saber quanta
  // altura está disponível abaixo dele — `getBoundingClientRect().top` não depende do próprio
  // rowHeight (só do que vem ACIMA do grid: PageHeader), então não há realimentação. Ref
  // callback (não useRef+useEffect vazio) porque o elemento só existe depois que `cameras`
  // carrega — mesmo motivo de sempre (HistoryPage.tsx). Recalcula também no resize da janela.
  const recomputeViewport = useCallback(() => {
    setViewportHeight(window.innerHeight)
    if (gridWrapRef.current) {
      setGridTop(gridWrapRef.current.getBoundingClientRect().top)
    }
  }, [])

  const bindGridWrap = useCallback(
    (node: HTMLDivElement | null) => {
      gridWrapRef.current = node
      if (node) recomputeViewport()
    },
    [recomputeViewport],
  )

  useEffect(() => {
    window.addEventListener('resize', recomputeViewport)
    return () => window.removeEventListener('resize', recomputeViewport)
  }, [recomputeViewport])

  const rowHeight = computeRowHeight(viewportHeight, gridTop, cols)

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

  // "Mais" — grade customizada além dos presets fixos (1-4): pedido do navigator
  // ("pense numa opção grade customizada ou personalizada"), mesma mecânica de applyPreset,
  // só que o N vem de um input em vez de um botão fixo.
  const isCustomCols = !(LAYOUT_PRESETS as readonly number[]).includes(cols)
  const applyCustom = () => {
    const n = Math.round(Number(customValue))
    if (Number.isFinite(n) && n >= 1) applyPreset(n)
    setShowCustomInput(false)
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
                <Button
                  key={n}
                  id={`live-view-preset-${n}x${n}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(n)}
                  className={
                    cols === n
                      ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                      : 'bg-surface-2 text-muted hover:text-foreground'
                  }
                >
                  {n}×{n}
                </Button>
              ))}
              <Button
                id="live-view-preset-more"
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCustomValue(String(cols))
                  setShowCustomInput((v) => !v)
                }}
                className={
                  isCustomCols
                    ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                    : 'bg-surface-2 text-muted hover:text-foreground'
                }
              >
                Mais
              </Button>
              {showCustomInput && (
                <form
                  id="live-view-preset-custom-form"
                  className="flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    applyCustom()
                  }}
                >
                  <input
                    id="live-view-preset-custom-input"
                    type="number"
                    min={1}
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    className="w-14 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground"
                  />
                  <Button
                    id="live-view-preset-custom-apply"
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="bg-surface-2 text-muted hover:text-foreground"
                  >
                    Aplicar
                  </Button>
                </form>
              )}
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
