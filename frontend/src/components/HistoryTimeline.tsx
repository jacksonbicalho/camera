import { useEffect, useRef, useState } from 'react'
import { getToken } from '../auth'
import { CHUNK_FALLBACK_MS, type Recording } from '../pages/cameraUtils'
import { CAT_PRIORITY as EVENT_CAT_PRIORITY, type RecordingCategory } from '../pages/eventCategory'
import { posToTime, recordingAtMs, type TimelineWindow } from './timelineScale'

interface RecordingItem {
  rec: Recording
  category: RecordingCategory
}

interface HistoryTimelineProps {
  /** Gravações do dia inteiro, já com a categoria calculada — SEM o filtro de chips
   * (Tudo/Movimento/Pessoa/Contínua), que afeta só a lista abaixo, não esta visão geral. */
  recordingItems: RecordingItem[]
  /** Chamado com o id da gravação escolhida (clique na trilha). */
  onSelect: (id: number) => void
  /** Câmera do Histórico atual — monta a URL do preview (event-frame). */
  cameraId: string
}

// Prioridade (maior → menor) para resolver a cor de um bloco de hora com várias
// categorias presentes — a mesma ordem de eventCategory.ts, com 'continua' ao final
// (sem eventos, só gravação contínua — a categoria mais "fraca").
const CAT_PRIORITY: RecordingCategory[] = [...EVENT_CAT_PRIORITY, 'continua']

const CAT_BG: Record<RecordingCategory, string> = {
  continua: 'bg-blue-500',
  movimento: 'bg-amber-400',
  pessoa: 'bg-red-500',
  ia: 'bg-violet-500',
  estados: 'bg-green-500',
}

// Marcação de TODAS as horas do dia (0..23) — formato compacto (sem zero-pad nem
// sufixo "h") pra caber em telas estreitas, onde a régua vira a largura total da
// viewport (abaixo do breakpoint lg as duas colunas do Histórico empilham).
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => i)
// Atraso entre o mouse parar de se mover e o preview (imagem + horário) aparecer — sem
// isso, CADA `mousemove` trocaria o `src` da <img> e bateria em GET .../event-frame, que
// no backend faz os.ReadDir + spawna um processo ffmpeg por chamada (extractFrame):
// passar o mouse pela régua geraria dezenas de requisições/ffmpeg por segundo. A linha
// vertical indicadora continua instantânea (não custa nada) — só a imagem/horário do
// tooltip espera o mouse "descansar".
const PREVIEW_DEBOUNCE_MS = 150

function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// eventFrameURL monta a URL do frame limpo extraído no instante dado — mesmo padrão de
// CameraStatesSettingsPage.tsx.
function eventFrameURL(cameraId: string, ms: number): string {
  return `/api/cameras/${cameraId}/event-frame?time=${encodeURIComponent(new Date(ms).toISOString())}&token=${getToken()}`
}

// HistoryTimeline — régua de 24h abaixo do player: um bloco por hora, colorido pela
// categoria de maior prioridade presente naquela hora, mais um resumo (total de gravações
// + hora de pico). Interação deliberadamente simples — SEM ponteiro arrastável nem
// listeners globais de `window` (o timeline horizontal anterior, removido, tinha bugs
// exatamente aí): só `onMouseMove`/`onMouseLeave` (sem estado de "arraste", cada evento é
// independente) para o preview, e `onClick` (ação discreta) pra selecionar.
export default function HistoryTimeline({
  recordingItems,
  onSelect,
  cameraId,
}: HistoryTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // hoverFraction: posição do mouse, atualizada a cada mousemove — move a linha vertical
  // instantaneamente. previewFraction: debounced — só ela dispara a busca da imagem.
  const [hoverFraction, setHoverFraction] = useState<number | null>(null)
  const [previewFraction, setPreviewFraction] = useState<number | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(
    () => () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    },
    [],
  )

  if (recordingItems.length === 0) return null

  const byHour = new Map<number, RecordingItem[]>()
  for (const item of recordingItems) {
    const hour = new Date(item.rec.start).getHours()
    const list = byHour.get(hour)
    if (list) list.push(item)
    else byHour.set(hour, [item])
  }

  // `byHour` itera na ordem de inserção de `recordingItems`, que vem em ordem
  // DECRESCENTE de horário (mesma convenção de `HistoryPage.tsx`) — o desempate por
  // contagem igual precisa comparar a hora numericamente (não a ordem de iteração),
  // senão empates favorecem a hora mais tardia em vez da mais cedo.
  let peakHour = 0
  let peakCount = -1
  for (const [hour, items] of byHour) {
    if (items.length > peakCount || (items.length === peakCount && hour < peakHour)) {
      peakCount = items.length
      peakHour = hour
    }
  }

  // Janela do dia: meia-noite local (do 1º item) até +24h — régua fixa, sem seletor de
  // janela/zoom (o mockup não pede).
  const first = new Date(recordingItems[0].rec.start)
  const dayStartMs = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime()
  const win: TimelineWindow = { startMs: dayStartMs, endMs: dayStartMs + 24 * 3600_000 }

  function fractionFromClientX(clientX: number): number | null {
    const el = trackRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return null
    const f = (clientX - rect.left) / rect.width
    return f < 0 ? 0 : f > 1 ? 1 : f
  }

  function handleMouseMove(e: React.MouseEvent) {
    const f = fractionFromClientX(e.clientX)
    if (f == null) return
    setHoverFraction(f)
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => {
      setPreviewFraction(f)
      setPreviewFailed(false)
    }, PREVIEW_DEBOUNCE_MS)
  }

  function handleMouseLeave() {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    setHoverFraction(null)
    setPreviewFraction(null)
  }

  function handleClick(e: React.MouseEvent) {
    const f = fractionFromClientX(e.clientX)
    if (f == null) return
    const ms = posToTime(f, win)
    const hit = recordingAtMs(recordingItems, ms, CHUNK_FALLBACK_MS)
    if (hit) onSelect(hit.rec.id)
  }

  const previewMs = previewFraction != null ? posToTime(previewFraction, win) : null

  return (
    <div id="history-timeline" className="mt-2 flex flex-col gap-1">
      <div id="history-timeline-summary" className="text-caption text-muted">
        {recordingItems.length} gravações · pico entre {peakHour}h e {peakHour + 1}h
      </div>
      <div className="relative">
        {previewMs != null && (
          <div
            id="history-timeline-preview"
            className="pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 flex-col items-center gap-1"
            style={{ left: `${(previewFraction ?? 0) * 100}%` }}
          >
            <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded border border-border bg-surface-2">
              {previewFailed ? (
                <span className="text-caption text-faint">sem prévia</span>
              ) : (
                <img
                  src={eventFrameURL(cameraId, previewMs)}
                  alt={formatClock(previewMs)}
                  className="h-full w-full object-cover"
                  onError={() => setPreviewFailed(true)}
                />
              )}
            </div>
            <span className="rounded bg-foreground/80 px-1.5 py-0.5 text-caption text-background">
              {formatClock(previewMs)} · pré-visualização
            </span>
          </div>
        )}
        <div
          id="history-timeline-track"
          ref={trackRef}
          role="button"
          tabIndex={0}
          aria-label="Selecionar gravação na régua de 24h"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          className="flex h-6 w-full cursor-pointer gap-px overflow-hidden rounded"
        >
          {Array.from({ length: 24 }, (_, hour) => {
            const items = byHour.get(hour)
            const cat = items
              ? CAT_PRIORITY.find((c) => items.some((i) => i.category === c))
              : undefined
            return (
              <div
                key={hour}
                id={`history-timeline-hour-${hour}`}
                aria-hidden="true"
                className={`h-full flex-1 ${cat ? CAT_BG[cat] : 'bg-surface-2'}`}
              />
            )
          })}
        </div>
        {hoverFraction != null && (
          <div
            className="pointer-events-none absolute top-0 h-6 w-px bg-foreground/80"
            style={{ left: `${hoverFraction * 100}%` }}
          />
        )}
      </div>
      <div id="history-timeline-labels" className="flex justify-between text-caption text-faint">
        {HOUR_LABELS.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
    </div>
  )
}
