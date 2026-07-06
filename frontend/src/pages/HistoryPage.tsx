import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { authHeaders, getToken, onUnauthorized } from '../auth'
import Layout from '../components/Layout'
import CameraStageHeader from '../components/CameraStageHeader'
import { Loader2, Play } from '../components/Icons'
import { loadMotionEvents, loadRecordingsData, type MotionEvent, type Recording } from './cameraUtils'
import { recordingCategory, type RecordingCategory } from './eventCategory'

interface Camera {
  id: string
  name: string
  recording_enabled?: boolean
}

// Janela usada só pra classificar a categoria do chunk (recordingCategory) quando
// `end` não veio na API — mesmo fallback de tamanho usado no Filmstrip legado.
const CHUNK_FALLBACK_MS = 5 * 60_000

const CAT_BORDER: Record<RecordingCategory, string> = {
  continua: 'border-blue-500',
  movimento: 'border-amber-400',
  pessoa: 'border-red-500',
  ia: 'border-violet-500',
  estados: 'border-green-500',
}

// formatDuration calcula a duração do chunk: usa `end` (fim real) quando presente,
// senão infere pelo início do próximo chunk (mesmo espírito do clipSegments em
// lib/recordingsGateway.ts). Sem próximo chunk (é o último do dia) e sem `end`,
// não há como saber — não mostra badge.
function formatDuration(rec: Recording, next: Recording | undefined): string | null {
  const start = Date.parse(rec.start)
  const endMs = rec.end ? Date.parse(rec.end) : next ? Date.parse(next.start) : NaN
  if (Number.isNaN(start) || Number.isNaN(endMs)) return null
  const totalSec = Math.max(0, Math.round((endMs - start) / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// HistoryPage — histórico de gravações da câmera (rota /history/:cameraId). Mostra
// as gravações de hoje: player tocando a selecionada + tira de cards ("GRAVAÇÕES · N")
// pra trocar de gravação. Cabeçalho compartilhado com LivePage via CameraStageHeader
// (mesma largura, mesmo padrão de fullscreen — só sem o badge "AO VIVO").
export default function HistoryPage() {
  const { cameraId } = useParams<{ cameraId: string }>()
  const [camera, setCamera] = useState<Camera | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [events, setEvents] = useState<MotionEvent[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [videoLoading, setVideoLoading] = useState(true)

  useEffect(() => {
    if (!cameraId) return
    let cancelled = false

    async function load() {
      setError(null)
      setCamera(null)
      try {
        const res = await fetch('/api/cameras', { headers: authHeaders() })
        if (res.status === 401) {
          onUnauthorized()
          return
        }
        const data = await res.json()
        if (cancelled) return
        const cam = Array.isArray(data) ? (data as Camera[]).find(c => c.id === cameraId) : undefined
        if (!cam) {
          setError('Câmera não encontrada.')
          return
        }
        setCamera(cam)
      } catch {
        if (!cancelled) setError('Não foi possível carregar a câmera.')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [cameraId])

  useEffect(() => {
    if (!cameraId) return
    let cancelled = false

    async function load() {
      const [recRes, evs] = await Promise.all([
        loadRecordingsData(cameraId!, new Date(), 1, 'asc', 0),
        loadMotionEvents(cameraId!, new Date()),
      ])
      if (cancelled) return
      if (recRes === 401) {
        onUnauthorized()
        return
      }
      const recs = recRes.recordings.filter(r => !r.is_recording)
      setRecordings(recs)
      setEvents(evs)
      setSelectedId(recs.length > 0 ? recs[0].id : null)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [cameraId])

  const selected = useMemo(() => recordings.find(r => r.id === selectedId) ?? null, [recordings, selectedId])

  function selectRecording(id: number) {
    setSelectedId(id)
    setVideoLoading(true)
  }

  return (
    <Layout id="history-page" footerId="history-footer" contentClassName="p-4">
      <div id="history-content" className="mx-auto w-full max-w-5xl space-y-4">
        {error && (
          <div
            id="history-error"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
          >
            {error}
          </div>
        )}
        {camera && (
          <CameraStageHeader
            idPrefix="history"
            cameraId={camera.id}
            cameraName={camera.name}
            active="history"
            recordingEnabled={camera.recording_enabled}
          >
            <div
              id="history-player"
              data-on-video
              className="relative w-full overflow-hidden rounded-lg border border-border bg-black shadow-sm aspect-video"
            >
              {selected ? (
                <>
                  <video
                    id="history-player-video"
                    key={selected.id}
                    src={`${selected.url}?token=${getToken()}`}
                    className="h-full w-full"
                    controls
                    autoPlay
                    muted
                    onLoadedData={() => setVideoLoading(false)}
                  />
                  {videoLoading && (
                    <div
                      id="history-player-loading"
                      className="absolute inset-0 flex items-center justify-center bg-black/70"
                    >
                      <Loader2 className="h-8 w-8 animate-spin text-white/70" />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-body text-muted">
                  Sem gravações hoje.
                </div>
              )}
            </div>
          </CameraStageHeader>
        )}
        {recordings.length > 0 && (
          <div id="history-recordings">
            <p className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
              Gravações · {recordings.length}
            </p>
            <div id="history-recordings-list" className="flex gap-2 overflow-x-auto pb-1">
              {recordings.map((rec, i) => {
                const cat = recordingCategory(rec, events, CHUNK_FALLBACK_MS)
                const active = rec.id === selectedId
                const duration = formatDuration(rec, recordings[i + 1])
                return (
                  <button
                    key={rec.id}
                    id={`history-recording-${rec.id}`}
                    type="button"
                    onClick={() => selectRecording(rec.id)}
                    aria-current={active ? 'true' : undefined}
                    className={`relative flex h-20 w-32 shrink-0 flex-col justify-between rounded border-2 bg-surface-2 p-1.5 text-left transition-colors ${
                      active ? 'border-primary' : CAT_BORDER[cat]
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Play className="h-4 w-4 text-muted-foreground" />
                      {duration && (
                        <span className="rounded bg-foreground/10 px-1 text-caption text-foreground">{duration}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-caption font-medium tabular-nums text-foreground">
                        {formatClockTime(rec.start)}
                      </p>
                      <p className="text-caption capitalize text-muted">{cat}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
