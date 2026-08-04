import { useEffect, useRef, useState } from 'react'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import EventAnnotationsEditor from '../../components/EventAnnotationsEditor'
import { useSettings, type CameraSettings } from '../../hooks/useSettings'
import { authHeaders, getToken } from '../../auth'
import { Button } from '@/components/ui/button'

interface EventItem {
  id: number
  time: string
  score: number
  frame?: string
  label?: string
}

function frameURL(cameraId: string, eventTime: string, frame: string, bust?: number): string {
  const d = new Date(eventTime)
  const dateDir = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
  return `/recordings/${cameraId}/${dateDir}/${frame}?token=${getToken()}${bust ? `&t=${bust}` : ''}`
}

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200, 300, 500]

// LabelEventsPage — extraída de AnalysisSettingsPage.tsx (era a seção
// #label-events); rota própria (/settings/label-events) desacoplada da config
// global do YOLO/fine-tuning, que continua em AnalysisSettingsPage.
export default function LabelEventsPage() {
  const { settings } = useSettings()
  const cameras: CameraSettings[] = settings?.cameras ?? []

  const [labelCamID, setLabelCamID] = useState('')
  const [unlabeledOnly, setUnlabeledOnly] = useState(true)
  const [labelSearch, setLabelSearch] = useState('')
  const [labelLimit, setLabelLimit] = useState(50)
  const [labelPage, setLabelPage] = useState(1)
  const [labelEvents, setLabelEvents] = useState<EventItem[] | null>(null)
  const eventsLoadedAtRef = useRef(Date.now())
  const [labelTotal, setLabelTotal] = useState(0)
  const [labelInputs, setLabelInputs] = useState<Record<number, string>>({})
  const [labelSaveState, setLabelSaveState] = useState<Record<number, 'saved' | 'error'>>({})
  const [zoomEvent, setZoomEvent] = useState<{ src: string; id: number } | null>(null)
  const [labelRefreshTick, setLabelRefreshTick] = useState(0)
  const labelLoading = labelCamID !== '' && labelEvents === null

  // bulk selection state
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkLabel, setBulkLabel] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState<null | {
    action: 'dismiss' | 'label'
    label?: string
  }>(null)
  const [bulkError, setBulkError] = useState('')

  // per-row inline dismiss state
  const [rowDismissConfirm, setRowDismissConfirm] = useState<EventItem | null>(null)
  const [rowDismissBusy, setRowDismissBusy] = useState(false)

  const [showDismissed, setShowDismissed] = useState(false)

  function toggleSelect(id: number) {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function selectAllOnPage() {
    setSelected(new Set((labelEvents ?? []).map((e) => e.id)))
  }
  function clearSelection() {
    setSelected(new Set())
    setBulkLabel('')
    setBulkError('')
  }
  async function executeBulkDismiss() {
    const ids = Array.from(selected)
    setBulkBusy(true)
    setBulkError('')
    try {
      const r = await fetch('/api/events/bulk/dismiss', {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!r.ok) {
        setBulkError('Erro ao ignorar')
        return
      }
      clearSelection()
      setBulkConfirm(null)
      const newTotal = labelTotal - ids.length
      const lastPage = Math.max(1, Math.ceil(newTotal / labelLimit))
      if (labelPage > lastPage) setLabelPage(lastPage)
      setLabelEvents(null)
      setLabelRefreshTick((t) => t + 1)
    } finally {
      setBulkBusy(false)
    }
  }
  async function executeRowDismiss() {
    if (!rowDismissConfirm) return
    const id = rowDismissConfirm.id
    setRowDismissBusy(true)
    try {
      const r = await fetch('/api/events/bulk/dismiss', {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      if (!r.ok) return
      setRowDismissConfirm(null)
      const newTotal = labelTotal - 1
      const lastPage = Math.max(1, Math.ceil(newTotal / labelLimit))
      if (labelPage > lastPage) setLabelPage(lastPage)
      setLabelEvents(null)
      setLabelRefreshTick((t) => t + 1)
    } finally {
      setRowDismissBusy(false)
    }
  }
  async function executeBulkLabel() {
    const ids = Array.from(selected)
    const label = bulkLabel
    setBulkBusy(true)
    setBulkError('')
    try {
      const r = await fetch('/api/events/bulk/label', {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, label }),
      })
      if (!r.ok) {
        setBulkError('Erro ao aplicar label')
        return
      }
      clearSelection()
      setBulkConfirm(null)
      setLabelEvents(null)
      setLabelRefreshTick((t) => t + 1)
    } finally {
      setBulkBusy(false)
    }
  }

  useEffect(() => {
    if (!zoomEvent) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeZoomModal()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [zoomEvent])

  function openZoomModal(src: string, id: number) {
    setZoomEvent({ src, id })
  }

  function closeZoomModal() {
    setZoomEvent(null)
  }

  // Sincroniza o label do evento com o label da anotação salva, quando
  // divergem — mesmo comportamento do editor singular anterior (o label da
  // anotação "vencia" o label do evento, virando dado de treino curável).
  function handleAnnotationSaved(eventId: number, label: string) {
    const currentEventLabel = labelInputs[eventId] ?? ''
    if (label === currentEventLabel) return
    fetch(`/api/events/${eventId}/label`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
    setLabelInputs((s) => ({ ...s, [eventId]: label }))
    setLabelEvents(
      (prev) =>
        prev?.map((e) => (e.id === eventId ? { ...e, label: label || undefined } : e)) ?? null,
    )
  }

  useEffect(() => {
    if (!labelCamID) return
    const controller = new AbortController()
    const params = new URLSearchParams({
      page: String(labelPage),
      limit: String(labelLimit),
      ...(showDismissed ? { dismissed: 'true' } : {}),
      ...(!showDismissed && unlabeledOnly && !labelSearch ? { unlabeled: 'true' } : {}),
      ...(!showDismissed && labelSearch ? { label: labelSearch } : {}),
    })
    fetch(`/api/cameras/${labelCamID}/events?${params}`, {
      headers: authHeaders(),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        eventsLoadedAtRef.current = Date.now()
        setLabelEvents(d.events ?? [])
        setLabelTotal(d.total ?? 0)
        const inputs: Record<number, string> = {}
        for (const ev of d.events ?? []) inputs[ev.id] = ev.label ?? ''
        setLabelInputs(inputs)
        setLabelSaveState({})
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setLabelEvents([])
      })
    return () => controller.abort()
  }, [
    labelCamID,
    unlabeledOnly,
    labelSearch,
    labelPage,
    labelLimit,
    labelRefreshTick,
    showDismissed,
  ])

  function handleLabelBlur(eventId: number) {
    const label = labelInputs[eventId] ?? ''
    fetch(`/api/events/${eventId}/label`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    })
      .then((r) => {
        setLabelSaveState((s) => ({ ...s, [eventId]: r.ok ? 'saved' : 'error' }))
        if (r.ok) {
          setTimeout(
            () =>
              setLabelSaveState((s) => {
                const n = { ...s }
                delete n[eventId]
                return n
              }),
            1200,
          )
        }
      })
      .catch(() => setLabelSaveState((s) => ({ ...s, [eventId]: 'error' })))
  }

  return (
    <SettingsLayout id="label-events-page" footerId="label-events-footer">
      <div
        id="label-events"
        className="bg-surface-2 rounded-lg border border-border divide-y divide-border"
      >
        <PageHeader
          title="Rotular eventos"
          subtitle="Atribua labels de texto e bounding boxes aos eventos de movimento para curadoria do dataset de treino."
          className="p-4 mb-0"
        />
        <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              id="label-events-camera-select"
              className="bg-surface-2 text-foreground text-sm rounded px-3 py-1.5 border border-border focus:outline-none focus:border-ring"
              value={labelCamID}
              onChange={(e) => {
                setLabelCamID(e.target.value)
                setLabelPage(1)
                setLabelEvents(null)
                clearSelection()
              }}
            >
              <option value="">Selecionar câmera…</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Buscar label…"
              value={labelSearch}
              onChange={(e) => {
                setLabelSearch(e.target.value)
                setLabelPage(1)
                clearSelection()
              }}
              className="bg-surface-2 text-foreground text-sm rounded px-3 py-1.5 border border-border focus:outline-none focus:border-ring w-40"
            />
            {!showDismissed && (
              <label
                className={`flex items-center gap-1.5 text-xs cursor-pointer select-none ${labelSearch ? 'text-muted-foreground cursor-not-allowed' : 'text-muted-foreground'}`}
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={unlabeledOnly && !labelSearch}
                  disabled={!!labelSearch}
                  onChange={(e) => {
                    setUnlabeledOnly(e.target.checked)
                    setLabelPage(1)
                    setLabelEvents(null)
                    clearSelection()
                  }}
                />
                Sem label
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-muted-foreground">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={showDismissed}
                onChange={(e) => {
                  setShowDismissed(e.target.checked)
                  setLabelPage(1)
                  setLabelEvents(null)
                  clearSelection()
                }}
              />
              Ignorados
            </label>
          </div>
        </div>

        {labelCamID && (
          <div>
            {labelLoading && (
              <div className="p-6 text-center text-xs text-muted-foreground">Carregando…</div>
            )}
            {!labelLoading && labelEvents?.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {showDismissed
                  ? 'Nenhum evento ignorado.'
                  : unlabeledOnly
                    ? 'Nenhum evento sem label.'
                    : 'Nenhum evento encontrado.'}
              </div>
            )}
            {!labelLoading && (labelEvents?.length ?? 0) > 0 && (
              <>
                <div className="flex items-center gap-3 px-4 py-2 bg-surface/40 border-b border-border text-xs text-muted-foreground">
                  <label className="flex items-center gap-1.5 text-muted-foreground">
                    Por página:
                    <select
                      className="bg-surface-2 text-foreground text-xs rounded px-1.5 py-0.5 border border-border focus:outline-none focus:border-ring"
                      value={labelLimit}
                      onChange={(e) => {
                        setLabelLimit(Number(e.target.value))
                        setLabelPage(1)
                        clearSelection()
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={
                        (labelEvents?.length ?? 0) > 0 &&
                        labelEvents!.every((e) => selected.has(e.id))
                      }
                      onChange={(e) => (e.target.checked ? selectAllOnPage() : clearSelection())}
                    />
                    Selecionar todos da página
                  </label>
                  {selected.size > 0 && (
                    <span className="text-primary">
                      {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {selected.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/30 sticky top-0 z-10">
                    <input
                      type="text"
                      placeholder="label para aplicar em lote…"
                      value={bulkLabel}
                      onChange={(e) => setBulkLabel(e.target.value)}
                      className="flex-1 min-w-[10rem] bg-surface-2 text-foreground text-sm rounded px-2 py-1 border border-border focus:outline-none focus:border-ring"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={bulkBusy}
                      onClick={() => setBulkConfirm({ action: 'label', label: bulkLabel })}
                    >
                      Aplicar label
                    </Button>
                    {!showDismissed && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={bulkBusy}
                        onClick={() => setBulkConfirm({ action: 'dismiss' })}
                        className="bg-amber-700 hover:bg-amber-600 text-white"
                      >
                        Ignorar
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={bulkBusy}
                      onClick={clearSelection}
                    >
                      Limpar
                    </Button>
                    {bulkError && <span className="text-xs text-red-400">{bulkError}</span>}
                  </div>
                )}
                <ul className="divide-y divide-border">
                  {labelEvents!.map((ev) => {
                    const state = labelSaveState[ev.id]
                    const borderCls =
                      state === 'saved'
                        ? 'border-green-500'
                        : state === 'error'
                          ? 'border-red-500'
                          : 'border-border'
                    const isSelected = selected.has(ev.id)
                    return (
                      <li
                        key={ev.id}
                        className={`flex items-center gap-3 px-4 py-2 ${isSelected ? 'bg-primary/10' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="accent-primary flex-shrink-0"
                          checked={isSelected}
                          onChange={() => toggleSelect(ev.id)}
                        />
                        {ev.frame ? (
                          <button
                            type="button"
                            onClick={() =>
                              openZoomModal(
                                frameURL(labelCamID, ev.time, ev.frame!, eventsLoadedAtRef.current),
                                ev.id,
                              )
                            }
                            className="flex-shrink-0 rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring hover:opacity-80 transition-opacity"
                          >
                            <img
                              src={frameURL(
                                labelCamID,
                                ev.time,
                                ev.frame,
                                eventsLoadedAtRef.current,
                              )}
                              className="w-40 h-24 object-cover bg-surface"
                              alt=""
                            />
                          </button>
                        ) : (
                          <div className="w-40 h-24 rounded bg-surface flex-shrink-0 flex items-center justify-center text-muted-foreground text-xs">
                            sem frame
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground mb-1">
                            {new Date(ev.time).toLocaleString()}
                            <span className="ml-2 text-muted-foreground">
                              score: {ev.score.toFixed(2)}
                            </span>
                          </p>
                          <input
                            type="text"
                            placeholder="label…"
                            value={labelInputs[ev.id] ?? ''}
                            onChange={(e) =>
                              setLabelInputs((s) => ({ ...s, [ev.id]: e.target.value }))
                            }
                            onBlur={() => handleLabelBlur(ev.id)}
                            className={`w-full bg-surface-2 text-foreground text-sm rounded px-2 py-1 border ${borderCls} focus:outline-none focus:border-ring transition-colors`}
                          />
                        </div>
                        {!showDismissed && (
                          <button
                            type="button"
                            onClick={() => setRowDismissConfirm(ev)}
                            title="Ignorar este evento"
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="w-4 h-4"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 6l12 12M6 18L18 6"
                              />
                            </svg>
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}

            {labelTotal > labelLimit && (
              <div className="p-3 flex items-center justify-between border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {labelTotal} eventos · página {labelPage} de {Math.ceil(labelTotal / labelLimit)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setLabelPage((p) => Math.max(1, p - 1))
                      setLabelEvents(null)
                      clearSelection()
                    }}
                    disabled={labelPage === 1}
                  >
                    ← anterior
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setLabelPage((p) => p + 1)
                      setLabelEvents(null)
                      clearSelection()
                    }}
                    disabled={labelPage >= Math.ceil(labelTotal / labelLimit)}
                  >
                    próxima →
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {zoomEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => closeZoomModal()}
        >
          <div
            className="flex flex-col gap-3 w-full max-w-xl max-h-[85vh] overflow-y-auto bg-surface rounded-lg shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <EventAnnotationsEditor
              eventId={zoomEvent.id}
              imageSrc={zoomEvent.src}
              onAnnotationSaved={(label) => handleAnnotationSaved(zoomEvent.id, label)}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => closeZoomModal()}
              className="ml-auto"
            >
              Fechar
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={bulkConfirm?.action === 'dismiss'}
        title="Ignorar eventos"
        message={`Ignorar ${selected.size} evento${selected.size !== 1 ? 's' : ''}? Eles não aparecerão mais na lista de rotulagem.`}
        confirmLabel={bulkBusy ? 'Ignorando…' : 'Ignorar'}
        onConfirm={executeBulkDismiss}
        onCancel={() => {
          if (!bulkBusy) setBulkConfirm(null)
        }}
      />
      <ConfirmDialog
        open={!!rowDismissConfirm}
        title="Ignorar evento"
        message={
          rowDismissConfirm
            ? `Ignorar o evento de ${new Date(rowDismissConfirm.time).toLocaleString()}? Ele não aparecerá mais na lista de rotulagem.`
            : ''
        }
        confirmLabel={rowDismissBusy ? 'Ignorando…' : 'Ignorar'}
        onConfirm={executeRowDismiss}
        onCancel={() => {
          if (!rowDismissBusy) setRowDismissConfirm(null)
        }}
      />
      <ConfirmDialog
        open={bulkConfirm?.action === 'label'}
        title={bulkLabel ? 'Aplicar label' : 'Remover label'}
        message={
          bulkLabel
            ? `Aplicar label "${bulkLabel}" em ${selected.size} evento${selected.size !== 1 ? 's' : ''}?`
            : `Remover label de ${selected.size} evento${selected.size !== 1 ? 's' : ''}?`
        }
        confirmLabel={bulkBusy ? 'Aplicando…' : 'Aplicar'}
        onConfirm={executeBulkLabel}
        onCancel={() => {
          if (!bulkBusy) setBulkConfirm(null)
        }}
      />
    </SettingsLayout>
  )
}
