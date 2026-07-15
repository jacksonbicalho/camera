import type { Recording } from '../pages/cameraUtils'
import { CAT_PRIORITY as EVENT_CAT_PRIORITY, type RecordingCategory } from '../pages/eventCategory'

interface RecordingItem {
  rec: Recording
  category: RecordingCategory
}

interface HistoryTimelineProps {
  /** Gravações do dia inteiro, já com a categoria calculada — SEM o filtro de chips
   * (Tudo/Movimento/Pessoa/Contínua), que afeta só a lista abaixo, não esta visão geral. */
  recordingItems: RecordingItem[]
  /** Chamado com o id da gravação escolhida (clique num bloco). */
  onSelect: (id: number) => void
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

const HOUR_LABELS = [0, 4, 8, 12, 16, 20, 24]

// HistoryTimeline — régua de 24h abaixo do player: um bloco por hora, colorido pela
// categoria de maior prioridade presente naquela hora, mais um resumo (total de gravações
// + hora de pico). Interação deliberadamente simples (só clique) — o timeline horizontal
// anterior (removido) tinha bugs de arraste/seek com listeners globais de `window`; este
// não tem ponteiro arrastável nenhum.
export default function HistoryTimeline({ recordingItems, onSelect }: HistoryTimelineProps) {
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

  return (
    <div id="history-timeline" className="mt-2 flex flex-col gap-1">
      <div id="history-timeline-summary" className="text-caption text-muted">
        {recordingItems.length} gravações · pico entre {peakHour}h e {peakHour + 1}h
      </div>
      <div id="history-timeline-track" className="flex h-6 w-full gap-px overflow-hidden rounded">
        {Array.from({ length: 24 }, (_, hour) => {
          const items = byHour.get(hour)
          const cat = items
            ? CAT_PRIORITY.find((c) => items.some((i) => i.category === c))
            : undefined
          return (
            <button
              key={hour}
              id={`history-timeline-hour-${hour}`}
              type="button"
              aria-label={`${String(hour).padStart(2, '0')}h`}
              onClick={() => {
                if (!items) return
                const first = [...items].sort(
                  (a, b) => Date.parse(a.rec.start) - Date.parse(b.rec.start),
                )[0]
                onSelect(first.rec.id)
              }}
              className={`h-full flex-1 transition-opacity hover:opacity-80 ${
                cat ? CAT_BG[cat] : 'bg-surface-2'
              }`}
            />
          )
        })}
      </div>
      <div id="history-timeline-labels" className="flex justify-between text-caption text-faint">
        {HOUR_LABELS.map((h) => (
          <span key={h}>{String(h).padStart(2, '0')}h</span>
        ))}
      </div>
    </div>
  )
}
