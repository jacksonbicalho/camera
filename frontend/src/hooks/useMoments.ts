import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { authHeaders, getToken, onUnauthorized } from '../auth'

export interface Moment {
  camera_id: string
  camera_name: string
  time: string
  kind: 'motion' | 'state'
  label?: string
  category: string
  frame?: string
  score: number
}

interface UseMomentsParams {
  date: Date
  category: string
  cameras: Set<string>
  query: string
  page: number
}

interface UseMomentsResult {
  moments: Moment[]
  hasMore: boolean
  loaded: boolean
}

// useMoments busca eventos de movimento/pessoa/ia/estados agregados de todas as câmeras
// (GET /api/moments) — extraído de RecordingsPage.tsx (aba "Momentos") pra ser reaproveitado
// também pela MotionsPage (página dedicada). `page` é controlado por quem chama (não interno
// ao hook): resetar via um efeito próprio do hook introduziria um ciclo de render a mais (a
// mudança de categoria/câmera/data dispararia o fetch ANTES do reset rodar, com a página
// antiga) — o reset continua responsabilidade do caller, no mesmo handler que muda o filtro
// (mesmo timing de hoje, uma única busca por mudança de filtro).
export function useMoments({
  date,
  category,
  cameras,
  query,
  page,
}: UseMomentsParams): UseMomentsResult {
  const [moments, setMoments] = useState<Moment[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({
      date: format(date, 'yyyy-MM-dd'),
      page: String(page),
      limit: '120',
    })
    if (category !== 'todos') params.set('category', category)
    if (cameras.size > 0) params.set('cameras', [...cameras].join(','))
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
  }, [date, category, page, cameras, query])

  return { moments, hasMore, loaded }
}

const pad = (n: number) => String(n).padStart(2, '0')

// momentThumb resolve a URL do thumbnail: estado já vem como caminho absoluto
// (/recordings/state_history/...); movimento é só o nome do arquivo, montado a partir
// da câmera + dia UTC do instante.
export function momentThumb(m: Moment): string | null {
  if (!m.frame) return null
  if (m.frame.startsWith('/')) return `${m.frame}?token=${getToken()}`
  const d = new Date(m.time)
  const dir = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`
  return `/recordings/${m.camera_id}/${dir}/${m.frame}?token=${getToken()}`
}
