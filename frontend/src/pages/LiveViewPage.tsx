import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import GridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { authHeaders, onUnauthorized, getRole } from '../auth'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import Player from '../components/Player'
import ConfirmDialog from '../components/ConfirmDialog'
import { useFlyout } from '../components/sidebarFlyout'
import { Check, LayoutGrid, Pencil, Plus, Trash2 } from '../components/Icons'
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
  clampColsForViewport,
  removeCameraFromLayout,
  addCameraToLayout,
  loadHiddenCameraIds,
  saveHiddenCameraIds,
  DEFAULT_COLS,
  LAYOUT_PRESETS,
  type TileLayout,
} from '../lib/liveViewLayout'

const ResponsiveGridLayout = WidthProvider(GridLayout)

// GRID_MARGIN — espaçamento ENTRE tiles (`margin` default do react-grid-layout, não alterado
// neste projeto); usado só pelo overlay de células vazias (`live-view-grid-overlay`, T2) pra
// aproximar o tamanho real de cada célula no fundo desenhado via CSS.
const GRID_MARGIN = 10

interface Camera {
  id: string
  name: string
  live_transport?: string
  recording_enabled?: boolean
}

// LiveViewPage — página principal do sistema (`/`, T7: absorveu o papel de landing que era
// da extinta AllCamerasPage), mostra todas as câmeras ao vivo com layout CUSTOMIZÁVEL pelo
// usuário (arrastar/redimensionar tiles) via react-grid-layout — pedido explícito do
// navigator. Usa o subpath /legacy da lib (API v1 completa — ver comentário em
// LiveViewPage.test.tsx) por simplicidade: WidthProvider mede o container automaticamente,
// sem precisar lidar com a API v2 baseada em hooks (useContainerWidth) manualmente. O
// arranjo automático/persistência/reconciliação com a lista de câmeras vive em
// lib/liveViewLayout.ts (módulo puro, testado em isolamento). Persiste em localStorage —
// preferência de UI local, mesmo espírito de `ui-display-mode` (sidebar recolhido/expandido).
//
// Presets de layout (1×1/2×2/3×3/4×4) vivem num dropdown (gatilho `live-view-preset-trigger`
// + flyout `live-view-preset-menu`, mesmo padrão de `ThemeModeNav`/"color-mode" — `useFlyout`,
// portal pro body, Check ao lado da opção ativa) — pedido do navigator, no lugar de 4 botões
// soltos na toolbar. Escolher um preset reseta TODAS as câmeras VISÍVEIS pra 1 célula cada, na
// ordem — "definir o menor quadro possível e distribuir pelo espaço disponível" (pedido do
// navigator) — e troca `cols`. Preset "NxN" é uma grade REAL de N linhas × N colunas:
// `rowHeight` vem de `computeRowHeight` (altura da viewport disponível
// dividida pelas linhas), não da largura da coluna — um preset 1×1 preenche a altura
// disponível inteira numa única célula, 4×4 divide essa mesma altura em 4 linhas, sem exigir
// scroll pra ver todas as linhas do preset escolhido (feedback do navigator: o cálculo
// anterior, baseado só na largura, gerava células "grandes demais" nesse sentido).
// Redimensionar manualmente um tile (arrastar a borda) continua livre e não é travado pra
// múltiplos NxN — os presets cobrem o caso comum (arranjo simétrico); ver `## Revisão` da
// story pra esse escopo.
export default function LiveViewPage() {
  const navigate = useNavigate()
  const [cameras, setCameras] = useState<Camera[]>([])
  const [layout, setLayout] = useState<TileLayout[]>([])
  const [cols, setCols] = useState<number>(() => loadSavedCols() ?? DEFAULT_COLS)
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  )
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  )
  const [gridTop, setGridTop] = useState(0)
  const [gridWidth, setGridWidth] = useState(0)
  const gridWrapRef = useRef<HTMLDivElement | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => loadHiddenCameraIds())
  const [removeTarget, setRemoveTarget] = useState<Camera | null>(null)
  const {
    open: presetOpen,
    setOpen: setPresetOpen,
    pos: presetPos,
    btnRef: presetBtnRef,
    panelRef: presetPanelRef,
    toggle: togglePreset,
  } = useFlyout<HTMLButtonElement>()
  const {
    open: insertOpen,
    setOpen: setInsertOpen,
    pos: insertPos,
    btnRef: insertBtnRef,
    panelRef: insertPanelRef,
    toggle: toggleInsert,
  } = useFlyout<HTMLButtonElement>()

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
        // Onboarding (migrado da extinta AllCamerasPage, T7): LiveViewPage é a página
        // principal do sistema agora (`/`) — sem nenhuma câmera cadastrada, um admin
        // recém-instalado precisa ser guiado pro cadastro, não cair numa tela vazia.
        if (data.length === 0 && getRole() === 'admin') {
          navigate('/settings/cameras/new', { replace: true })
          return
        }
        setCameras(data)
        const ids = data.map((c) => c.id)
        const hidden = loadHiddenCameraIds()
        const saved = loadSavedLayout()
        setLayout(
          saved
            ? mergeLayoutWithCameras(saved, ids, hidden)
            : defaultLayout(ids.filter((id) => !hidden.includes(id))),
        )
      })
      .catch(() => {})
  }, [navigate])

  // Mede o topo E a largura do grid (mesmo getBoundingClientRect, um único DOM read) pra
  // computeRowHeight saber quanta altura está disponível abaixo dele E qual a largura real de
  // coluna (T1, história fix/liveview-mobile-player-notificacoes — sem a largura, o rowHeight
  // não tinha como respeitar a proporção do vídeo em viewports estreitas). Nenhum dos dois
  // depende do próprio rowHeight (só do que vem ACIMA do grid: PageHeader), então não há
  // realimentação. Ref callback (não useRef+useEffect vazio) porque o elemento só existe
  // depois que `cameras` carrega — mesmo motivo de sempre (HistoryPage.tsx). Recalcula também
  // no resize da janela.
  const recomputeViewport = useCallback(() => {
    setViewportHeight(window.innerHeight)
    setViewportWidth(window.innerWidth)
    if (gridWrapRef.current) {
      const rect = gridWrapRef.current.getBoundingClientRect()
      setGridTop(rect.top)
      setGridWidth(rect.width)
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

  // effectiveCols só afeta a RENDERIZAÇÃO do grid (rowHeight + cols do
  // ResponsiveGridLayout) em viewports estreitas — `cols` em si (o preset
  // escolhido, ex. "3×3" no dropdown) não muda, pra voltar ao normal sozinho
  // quando a tela alargar de novo.
  const effectiveCols = clampColsForViewport(cols, viewportWidth)
  const columnWidth = gridWidth / Math.max(1, effectiveCols)
  const rowHeight = computeRowHeight(viewportHeight, gridTop, effectiveCols, columnWidth)

  // react-grid-layout entrega um array `readonly` (Layout) pro callback — copia pra um
  // array mutável antes de guardar no estado/persistir (TileLayout tem o mesmo shape).
  const handleLayoutChange = (next: readonly TileLayout[]) => {
    const copy = next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
    setLayout(copy)
    saveLayout(copy)
  }

  // applyPreset relayouta só as câmeras VISÍVEIS (não-ocultas) — usar `cameras` inteiro aqui
  // ressuscitaria no grid uma câmera que o usuário acabou de remover (T6, curadoria de
  // câmeras nesta tela), contradizendo `hiddenIds`.
  const applyPreset = (n: number) => {
    setCols(n)
    saveCols(n)
    const visibleIds = cameras.filter((cam) => !hiddenIds.includes(cam.id)).map((cam) => cam.id)
    const next = presetLayout(visibleIds, n)
    setLayout(next)
    saveLayout(next)
  }

  // Curadoria de câmeras nesta tela (T6, feedback do navigator): a câmera continua
  // funcionando normalmente no sistema, só sai/entra da grade do LiveView — sem quadro vazio
  // no lugar. `hiddenIds` (persistido) é o que impede `mergeLayoutWithCameras` de trazer de
  // volta sozinha, num próximo carregamento, uma câmera que o usuário removeu de propósito.
  const visibleCameras = cameras.filter((cam) => layout.some((t) => t.i === cam.id))
  const availableToAdd = cameras.filter((cam) => !layout.some((t) => t.i === cam.id))

  const confirmRemove = () => {
    if (!removeTarget) return
    const nextLayout = removeCameraFromLayout(layout, removeTarget.id)
    const nextHidden = [...hiddenIds, removeTarget.id]
    setLayout(nextLayout)
    saveLayout(nextLayout)
    setHiddenIds(nextHidden)
    saveHiddenCameraIds(nextHidden)
    setRemoveTarget(null)
  }

  const insertCamera = (camId: string) => {
    const nextLayout = addCameraToLayout(layout, camId)
    const nextHidden = hiddenIds.filter((id) => id !== camId)
    setLayout(nextLayout)
    saveLayout(nextLayout)
    setHiddenIds(nextHidden)
    saveHiddenCameraIds(nextHidden)
    setInsertOpen(false)
  }

  return (
    <Layout id="live-view-page" footerId="live-view-footer" contentClassName="p-6">
      <div id="live-view-content" className="page-content space-y-4">
        <PageHeader
          title="Ao vivo"
          actionsWrap={false}
          actions={
            <div id="live-view-presets" className="flex items-center gap-1.5">
              <Button
                id="live-view-preset-trigger"
                ref={presetBtnRef}
                type="button"
                variant="outline"
                size="sm"
                onClick={togglePreset}
                title={`Layout ${cols}×${cols}`}
                className="bg-surface-2 text-muted hover:text-foreground"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {cols}×{cols}
                </span>
              </Button>
              {presetOpen &&
                createPortal(
                  <div
                    id="live-view-preset-menu"
                    ref={presetPanelRef}
                    style={{
                      position: 'fixed',
                      top: presetPos.top,
                      right: presetPos.right,
                      zIndex: 9999,
                    }}
                    className="w-32 bg-surface border border-border rounded shadow-lg"
                  >
                    {LAYOUT_PRESETS.map((n) => {
                      const active = cols === n
                      return (
                        <button
                          key={n}
                          id={`live-view-preset-${n}x${n}`}
                          type="button"
                          aria-current={active ? 'true' : undefined}
                          onClick={() => {
                            applyPreset(n)
                            setPresetOpen(false)
                          }}
                          className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors ${
                            active
                              ? 'bg-accent text-accent-foreground font-medium'
                              : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                          }`}
                        >
                          <Check
                            className={`w-4 h-4 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`}
                          />
                          <span>
                            {n}×{n}
                          </span>
                        </button>
                      )
                    })}
                  </div>,
                  document.body,
                )}
              <Button
                id="live-view-edit-toggle"
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={editMode}
                onClick={() => {
                  setEditMode((v) => !v)
                  setInsertOpen(false)
                }}
                title={editMode ? 'Aplicar alterações' : 'Editar grid'}
                className={
                  editMode
                    ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                    : 'bg-surface-2 text-muted hover:text-foreground'
                }
              >
                {editMode ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Aplicar alterações</span>
                  </>
                ) : (
                  <>
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Editar grid</span>
                  </>
                )}
              </Button>
              {editMode && (
                <>
                  <Button
                    id="live-view-insert-camera"
                    ref={insertBtnRef}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={availableToAdd.length === 0}
                    onClick={toggleInsert}
                    className="bg-surface-2 text-muted hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Inserir câmera
                  </Button>
                  {insertOpen &&
                    availableToAdd.length > 0 &&
                    createPortal(
                      <div
                        id="live-view-insert-camera-menu"
                        ref={insertPanelRef}
                        style={{
                          position: 'fixed',
                          top: insertPos.top,
                          right: insertPos.right,
                          zIndex: 9999,
                        }}
                        className="w-48 rounded-md border border-border bg-surface py-1 shadow-xl"
                      >
                        {availableToAdd.map((cam) => (
                          <button
                            key={cam.id}
                            id={`live-view-insert-camera-${cam.id}`}
                            type="button"
                            onClick={() => insertCamera(cam.id)}
                            className="block w-full truncate px-3 py-1.5 text-left text-body text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                          >
                            {cam.name}
                          </button>
                        ))}
                      </div>,
                      document.body,
                    )}
                </>
              )}
            </div>
          }
        />
        {cameras.length === 0 ? (
          <p id="live-view-empty" className="text-faint text-body">
            Nenhuma câmera configurada.
          </p>
        ) : visibleCameras.length === 0 ? (
          <p id="live-view-empty-visible" className="text-faint text-body">
            Nenhuma câmera nesta tela. Ative "Editar grid" e use "Inserir câmera" pra adicionar uma.
          </p>
        ) : (
          // ResponsiveGridLayout (react-grid-layout/legacy) não aceita `id` como prop —
          // envolve num wrapper próprio pra manter a convenção de id estável em todo
          // elemento de UI (CLAUDE.md). `containerPadding={[0, 0]}` — a lib aplica um
          // padding interno de 10px por padrão, somado ao `p-6` (24px) da página; medido
          // (getBoundingClientRect real, Playwright) o 1º tile ficava em x=90 enquanto o
          // `.page-content` de outras páginas começa em x=80 no mesmo
          // viewport — os 10px extras da lib quebravam a margem consistente entre páginas
          // (bug real reportado pelo navigator). Zerar aqui faz os tiles começarem exatamente
          // na borda do `p-6`, igual a qualquer outra página; o espaçamento ENTRE tiles
          // continua vindo de `margin` (default da lib, não mexido).
          <div id="live-view-grid" ref={bindGridWrap} className="relative">
            {editMode && (
              // Contorno das células do grid (inclusive vazias) em modo de edição — pedido do
              // navigator: sem isso, só os tiles já posicionados dão alguma pista da estrutura
              // do grid por trás, mesmo com espaço livre pra mais câmeras. react-grid-layout
              // não tem suporte nativo a "fundo de grid" — desenhado por cima via CSS puro
              // (2 gradientes lineares repetidos, um por eixo), sem depender de medir células
              // reais da lib. GRID_MARGIN casa com o `margin` default da lib (não alterado
              // neste projeto) — aproximação suficiente pra indicar a estrutura, não precisa
              // bater pixel a pixel com os tiles de verdade.
              <div
                id="live-view-grid-overlay"
                aria-hidden="true"
                data-cols={effectiveCols}
                data-row-height={rowHeight}
                className="pointer-events-none absolute inset-0 z-10"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, var(--color-border) 1px, transparent 1px), ' +
                    'linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
                  backgroundSize: `${columnWidth + GRID_MARGIN}px ${rowHeight + GRID_MARGIN}px`,
                }}
              />
            )}
            <ResponsiveGridLayout
              className="layout"
              layout={layout}
              cols={effectiveCols}
              rowHeight={rowHeight}
              onLayoutChange={handleLayoutChange}
              isDraggable={editMode}
              isResizable={editMode}
              containerPadding={[0, 0]}
            >
              {visibleCameras.map((cam) => (
                <div
                  key={cam.id}
                  id={`live-view-tile-${cam.id}`}
                  className={`overflow-hidden rounded-lg border bg-surface ${
                    editMode
                      ? 'cursor-move border-primary/50 ring-2 ring-primary/30'
                      : 'border-border'
                  }`}
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
                    footerTrailing={
                      editMode && (
                        <button
                          id={`live-view-remove-${cam.id}`}
                          type="button"
                          onClick={() => setRemoveTarget(cam)}
                          aria-label={`Remover ${cam.name} desta tela`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )
                    }
                  >
                    <span className="absolute top-2 left-2 bg-danger text-white text-caption px-2 py-0.5 rounded font-medium pointer-events-none">
                      {cam.recording_enabled === false ? 'AO VIVO' : 'GRAVANDO'}
                    </span>
                  </Player>
                </div>
              ))}
            </ResponsiveGridLayout>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={removeTarget !== null}
        title="Remover câmera desta tela"
        message={
          removeTarget
            ? `Remover "${removeTarget.name}" do Ao vivo? A câmera continua funcionando normalmente no sistema — só sai desta tela.`
            : ''
        }
        confirmLabel="Remover"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </Layout>
  )
}
