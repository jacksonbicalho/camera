import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import DatePicker from '../components/DatePicker'
import { authHeaders, onUnauthorized, getToken } from '../auth'
import { resolveEventRecordingUrl } from '../lib/eventNavigation'

const CAT_LABEL: Record<string, string> = {
  movimento: 'Movimento',
  pessoa: 'Pessoa',
  ia: 'IA',
  estados: 'Estados',
}
const CAT_COLOR: Record<string, string> = {
  movimento: 'bg-amber-400',
  pessoa: 'bg-red-500',
  ia: 'bg-violet-500',
  estados: 'bg-green-500',
}
const CAT_FILTERS = ['todos', 'movimento', 'pessoa', 'ia', 'estados'] as const
const WINDOWS = [1, 2, 4, 6, 12, 24] as const

// parseLocalDate — parseia "yyyy-MM-dd" como data LOCAL (sem o deslocamento de fuso
// de `new Date(string)`, que interpreta como UTC). Sem :date válido, cai em hoje.
// Mesma forma do helper (não-exportado) de ReportsPage.tsx.
function parseLocalDate(s: string | undefined): Date {
  const [y, m, d] = (s ?? '').split('-').map(Number)
  if (!y || !m || !d) return new Date()
  return new Date(y, m - 1, d)
}

// nearestWindow — resolve um valor de :hour da URL pra janela válida mais próxima
// (mesma forma de nearestRange() em ReportsPage.tsx). Sem :hour válido, cai em 24
// (dia inteiro — default atual).
function nearestWindow(n: number): number {
  if (!Number.isFinite(n)) return 24
  if ((WINDOWS as readonly number[]).includes(n)) return n
  return WINDOWS.reduce(
    (best, opt) => (Math.abs(opt - n) < Math.abs(best - n) ? opt : best),
    WINDOWS[0],
  )
}

interface CameraOption {
  id: string
  name: string
}
interface Moment {
  camera_id: string
  camera_name: string
  time: string
  kind: 'motion' | 'state'
  label?: string
  category: string
  frame?: string
  score: number
}

interface RecordingItem {
  id: number
  camera_id: string
  camera_name: string
  start: string
  has_motion: boolean
  url: string
}

const pad = (n: number) => String(n).padStart(2, '0')

// momentThumb resolve a URL do thumbnail: estado já vem como caminho absoluto
// (/recordings/state_history/...); movimento é só o nome do arquivo, montado a partir
// da câmera + dia UTC do instante.
function momentThumb(m: Moment): string | null {
  if (!m.frame) return null
  if (m.frame.startsWith('/')) return `${m.frame}?token=${getToken()}`
  const d = new Date(m.time)
  const dir = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`
  return `/recordings/${m.camera_id}/${dir}/${m.frame}?token=${getToken()}`
}

export default function RecordingsPage() {
  const {
    date: dateParam,
    hour: hourParam,
    view: viewParam,
  } = useParams<{ date?: string; hour?: string; view?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [cameras, setCameras] = useState<CameraOption[]>([])
  const [selectedCams, setSelectedCams] = useState<Set<string>>(new Set())
  const [category, setCategory] = useState<string>('todos')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [date, setDate] = useState<Date>(() => parseLocalDate(dateParam))
  const [moments, setMoments] = useState<Moment[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState(false)
  // Default 'moments' quando o segmento :view vem ausente/inválido na URL (troca do
  // default anterior, que era 'recordings' — pedido do navigator).
  const [view, setView] = useState<'recordings' | 'moments'>(() =>
    viewParam === 'recordings' ? 'recordings' : 'moments',
  )
  const [hour, setHour] = useState(() => nearestWindow(Number(hourParam)))
  const [motionOnly, setMotionOnly] = useState(false)
  const [recordings, setRecordings] = useState<RecordingItem[]>([])
  const [recLoaded, setRecLoaded] = useState(false)
  const [contentDays, setContentDays] = useState<string[]>([])

  // Mantém a URL sincronizada com data/janela/modo (fonte compartilhável) — mesmo
  // padrão de ReportsPage.tsx/HistoryPage.tsx: só navega quando o alvo difere da
  // rota atual, senão entraria em loop com a navegação disparada por esta troca.
  // O segmento :view só aparece na URL quando não é o default ('moments').
  useEffect(() => {
    const dateStr = format(date, 'yyyy-MM-dd')
    const target =
      view === 'recordings'
        ? `/recordings/${dateStr}/${hour}/recordings`
        : `/recordings/${dateStr}/${hour}`
    if (location.pathname !== target) navigate(target, { replace: true })
  }, [date, hour, view, location.pathname, navigate])

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

  // Dias com gravação ou momento (das câmeras selecionadas, ou todas) — habilitam
  // só esses no calendário.
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

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({
      date: format(date, 'yyyy-MM-dd'),
      page: String(page),
      limit: '120',
    })
    if (category !== 'todos') params.set('category', category)
    if (selectedCams.size > 0) params.set('cameras', [...selectedCams].join(','))
    if (query) params.set('q', query)
    fetch(`/api/moments?${params}`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          onUnauthorized()
          return null
        }
        return r.json()
      })
      .then((d) => {
        if (cancelled || !d) return
        setMoments((prev) => (page === 1 ? d.moments : [...prev, ...d.moments]))
        setHasMore(d.hasMore)
        setLoaded(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [date, category, page, selectedCams, query])

  // Modo Gravações: lista os chunks do dia (tabela recordings) com janela + só-movimento.
  useEffect(() => {
    if (view !== 'recordings') return
    let cancelled = false
    const params = new URLSearchParams({ date: format(date, 'yyyy-MM-dd'), window: String(hour) })
    if (selectedCams.size > 0) params.set('cameras', [...selectedCams].join(','))
    if (motionOnly) params.set('motion_only', 'true')
    fetch(`/api/recordings?${params}`, { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          onUnauthorized()
          return null
        }
        return r.json()
      })
      .then((d) => {
        if (cancelled || !d) return
        setRecordings(d.recordings)
        setRecLoaded(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [view, date, hour, motionOnly, selectedCams])

  // Clique num item da aba Gravações: já se sabe o :recordingId exato (o próprio
  // RecordingItem.id) — não precisa resolver nada via resolveEventRecordingUrl.
  const openRecording = (cameraId: string, recordingId: number) =>
    navigate(`/recording/${cameraId}/${recordingId}`)

  // Clique num "momento" (aba Momentos): só se tem câmera+instante (a API de
  // momentos não expõe o id do evento) — precisa resolver recordingId/motionId.
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
    <Layout id="recordings-page" footerId="recordings-footer" contentClassName="p-6">
      <div id="recordings-content" className="page-content space-y-4">
        <PageHeader
          className="flex-wrap"
          title="Gravações"
          subtitle={
            view === 'recordings'
              ? 'Todas as gravações do dia — clique para abrir.'
              : 'Momentos das câmeras — clique para abrir na gravação.'
          }
          actions={
            <>
              <div
                id="recordings-view-toggle"
                className="flex items-center rounded-md border border-border overflow-hidden"
              >
                <button
                  id="recordings-view-recordings"
                  onClick={() => setView('recordings')}
                  className={`px-2.5 py-1.5 text-xs transition-colors ${view === 'recordings' ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted hover:text-foreground'}`}
                >
                  Gravações
                </button>
                <button
                  id="recordings-view-moments"
                  onClick={() => setView('moments')}
                  className={`px-2.5 py-1.5 text-xs transition-colors ${view === 'moments' ? 'bg-primary text-primary-foreground' : 'bg-surface text-muted hover:text-foreground'}`}
                >
                  Momentos
                </button>
              </div>
              {view === 'moments' && (
                <input
                  id="recordings-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por conteúdo…"
                  aria-label="Buscar momentos por conteúdo"
                  className="w-48 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-faint focus:outline-none focus:border-primary/50"
                />
              )}
              <DatePicker
                id="recordings-day-picker"
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

        {/* Filtro de categoria (modo Momentos) */}
        {view === 'moments' && (
          <div id="recordings-category-chips" className="flex flex-wrap items-center gap-1.5 mb-2">
            {CAT_FILTERS.map((c) => (
              <button
                key={c}
                id={`recordings-cat-${c}`}
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
                {c !== 'todos' && <span className={`w-1.5 h-1.5 rounded-full ${CAT_COLOR[c]}`} />}
                {c === 'todos' ? 'Todos' : CAT_LABEL[c]}
              </button>
            ))}
          </div>
        )}

        {/* Filtros do modo Gravações: janela + só com movimento */}
        {view === 'recordings' && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <div id="recordings-window-chips" className="flex flex-wrap items-center gap-1.5">
              {WINDOWS.map((n) => (
                <button
                  key={n}
                  id={`recordings-window-${n}`}
                  onClick={() => setHour(n)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                    hour === n
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-2 text-muted hover:text-foreground'
                  }`}
                >
                  {n === 24 ? 'Dia inteiro' : `${n}h`}
                </button>
              ))}
            </div>
            <button
              id="recordings-motion-only"
              onClick={() => setMotionOnly((v) => !v)}
              className={`ml-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors ${
                motionOnly
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-2 text-muted hover:text-foreground'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Só com movimento
            </button>
          </div>
        )}

        {/* Filtro de câmera (multi; nenhuma marcada = todas) */}
        {cameras.length > 1 && (
          <div id="recordings-camera-chips" className="flex flex-wrap items-center gap-1.5 mb-4">
            {cameras.map((c) => (
              <button
                key={c.id}
                id={`recordings-cam-${c.id}`}
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

        {view === 'recordings' ? (
          recordings.length === 0 && recLoaded ? (
            <p className="text-sm text-muted">
              {motionOnly
                ? 'Nenhuma gravação com movimento nesta janela.'
                : 'Nenhuma gravação nesta janela.'}
            </p>
          ) : (
            <div
              id="recordings-list"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
            >
              {recordings.map((rec) => (
                <button
                  key={rec.id}
                  id={`recording-${rec.id}`}
                  onClick={() => openRecording(rec.camera_id, rec.id)}
                  className="bg-surface border border-border rounded-lg overflow-hidden text-left hover:border-primary/50 transition-colors"
                >
                  <div className="w-full aspect-video bg-surface-2 flex items-center justify-center text-faint">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
                    </svg>
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {rec.has_motion && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0 bg-amber-400"
                          title="movimento"
                        />
                      )}
                      <span className="text-xs font-medium text-foreground truncate">
                        {rec.camera_name}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted tabular-nums">
                      {format(new Date(rec.start), 'dd/MM HH:mm:ss')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : moments.length === 0 && loaded ? (
          <p className="text-sm text-muted">
            {query ? `Nenhum momento para «${query}» nesta data.` : 'Nenhum momento nesta data.'}
          </p>
        ) : (
          <div
            id="recordings-grid"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
          >
            {moments.map((m, i) => {
              const thumb = momentThumb(m)
              return (
                <button
                  key={`${m.camera_id}-${m.time}-${i}`}
                  id={`moment-${i}`}
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
                        className={`w-2 h-2 rounded-full shrink-0 ${CAT_COLOR[m.category] ?? 'bg-border'}`}
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

        {hasMore && view === 'moments' && (
          <div className="flex justify-center mt-4">
            <button
              id="recordings-load-more"
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded text-xs bg-surface-2 text-muted hover:text-foreground transition-colors"
            >
              Carregar mais
            </button>
          </div>
        )}
      </div>
    </Layout>
  )
}
