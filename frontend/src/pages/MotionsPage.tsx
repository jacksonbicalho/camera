import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import DatePicker from '../components/DatePicker'
import { Button } from '../components/ui/button'
import { authHeaders, onUnauthorized } from '../auth'
import { resolveEventRecordingUrl } from '../lib/eventNavigation'
import { categoryColor, categoryLabel } from './eventCategory'
import { useMoments, momentThumb } from '../hooks/useMoments'

// sortCategories/parseLocalDate — mesma lógica de RecordingsPage.tsx/ReportsPage.tsx
// (pessoa primeiro, movimento depois, resto alfabético, estados sempre por último).
function sortCategories(categories: Iterable<string>): string[] {
  const rank = (cat: string) =>
    cat === 'pessoa' ? 0 : cat === 'movimento' ? 1 : cat === 'estados' ? 3 : 2
  return [...categories].sort((a, b) => {
    const diff = rank(a) - rank(b)
    return diff !== 0 ? diff : a.localeCompare(b)
  })
}

function parseLocalDate(s: string | undefined): Date {
  const [y, m, d] = (s ?? '').split('-').map(Number)
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d)
}

interface CameraOption {
  id: string
  name: string
}

// MotionsPage — página dedicada aos "momentos" (eventos de movimento/pessoa/ia/estados
// agregados de todas as câmeras), sem janela de horas (a busca é só por dia). Coexiste com a
// aba "Momentos" já existente dentro de RecordingsPage — mesmo dado (GET /api/moments, via
// useMoments compartilhado), UI própria.
export default function MotionsPage() {
  const { date: dateParam } = useParams<{ date?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [cameras, setCameras] = useState<CameraOption[]>([])
  const [selectedCams, setSelectedCams] = useState<Set<string>>(new Set())
  const [category, setCategory] = useState<string>('todos')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [date, setDate] = useState<Date>(() => parseLocalDate(dateParam))
  const [page, setPage] = useState(1)
  const [contentDays, setContentDays] = useState<string[]>([])
  const { moments, hasMore, loaded } = useMoments({
    date,
    category,
    cameras: selectedCams,
    query,
    page,
  })

  const filterOptions = useMemo(() => {
    const present = new Set<string>()
    for (const m of moments) present.add(m.category)
    present.add(category)
    present.delete('todos')
    return ['todos', ...sortCategories(present)]
  }, [moments, category])

  // Mantém a URL sincronizada com a data (fonte compartilhável) — mesmo padrão de
  // RecordingsPage.tsx/ReportsPage.tsx/HistoryPage.tsx.
  useEffect(() => {
    const target = `/motions/${format(date, 'yyyy-MM-dd')}`
    if (location.pathname !== target) navigate(target, { replace: true })
  }, [date, location.pathname, navigate])

  useEffect(() => {
    fetch('/api/cameras', { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          onUnauthorized()
          return null
        }
        return r.json()
      })
      .then((list: CameraOption[] | null) => {
        if (list) setCameras(list)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedCams.size > 0) params.set('cameras', [...selectedCams].join(','))
    fetch(`/api/content-days?${params}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { days: [] }))
      .then((d: { days?: string[] }) => setContentDays(d.days ?? []))
      .catch(() => {})
  }, [selectedCams])

  // debounce do termo de busca: só vira `query` (que dispara o fetch) após 300 ms parado
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const openMoment = async (cameraId: string, time: string) => {
    const url = await resolveEventRecordingUrl(cameraId, time)
    if (url) navigate(url)
  }

  const toggleCam = (id: string) => {
    setSelectedCams((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setPage(1)
  }

  return (
    <Layout id="motions-page" footerId="motions-footer" contentClassName="p-6">
      <div id="motions-content" className="page-content space-y-4">
        <PageHeader
          className="flex-wrap"
          title="Momentos"
          subtitle="Eventos de movimento, pessoa, IA e estados de todas as câmeras — clique para abrir na gravação."
          actions={
            <>
              <input
                id="motions-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por conteúdo…"
                aria-label="Buscar momentos por conteúdo"
                className="w-48 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-primary/50"
              />
              <DatePicker
                id="motions-day-picker"
                value={date}
                onChange={(d) => {
                  setDate(d)
                  setPage(1)
                }}
                disableFuture
                availableDays={contentDays}
                align="right"
              />
            </>
          }
        />

        <div id="motions-category-chips" className="flex flex-wrap items-center gap-1.5 mb-2">
          {filterOptions.map((c) => (
            <button
              key={c}
              id={`motions-cat-${c}`}
              onClick={() => {
                setCategory(c)
                setPage(1)
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
                category === c
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-2 text-muted hover:text-foreground'
              }`}
            >
              {c !== 'todos' && <span className={`w-1.5 h-1.5 rounded-full ${categoryColor(c)}`} />}
              {c === 'todos' ? 'Todos' : categoryLabel(c)}
            </button>
          ))}
        </div>

        {cameras.length > 1 && (
          <div id="motions-camera-chips" className="flex flex-wrap items-center gap-1.5 mb-4">
            {cameras.map((c) => (
              <button
                key={c.id}
                id={`motions-cam-${c.id}`}
                onClick={() => toggleCam(c.id)}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  selectedCams.has(c.id)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-2 text-muted hover:text-foreground'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {moments.length === 0 && loaded ? (
          <p className="text-sm text-muted">
            {query ? `Nenhum momento para «${query}» nesta data.` : 'Nenhum momento nesta data.'}
          </p>
        ) : (
          <div
            id="motions-grid"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
          >
            {moments.map((m, i) => {
              const thumb = momentThumb(m)
              return (
                <button
                  key={`${m.camera_id}-${m.time}-${i}`}
                  id={`motion-${i}`}
                  onClick={() => openMoment(m.camera_id, m.time)}
                  className="bg-surface border border-border rounded-lg overflow-hidden text-left hover:border-primary/50 transition-colors"
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={m.category}
                      className="w-full aspect-video object-cover bg-black"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-surface-2 flex items-center justify-center text-[10px] text-faint">
                      sem prévia
                    </div>
                  )}
                  <div className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${categoryColor(m.category)}`}
                      />
                      <span className="text-xs font-medium text-foreground truncate">
                        {m.camera_name}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted tabular-nums">
                      {format(new Date(m.time), 'dd/MM HH:mm')}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center mt-4">
            <Button
              id="motions-load-more"
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
            >
              Carregar mais
            </Button>
          </div>
        )}
      </div>
    </Layout>
  )
}
