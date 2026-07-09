import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import VideoPlayer, { type VideoPlayerSegment } from '../components/VideoPlayer'
import {
  RecordingsGateway,
  clipSegments,
  UNAUTHORIZED,
  type Recording,
  type GatewayEvent,
} from '../lib/recordingsGateway'
import { formatDateTime } from '../lib/datetime'

// VideoBrowserPage é a página nova (método estrangulamento) que reproduz gravações
// consumindo SÓ o RecordingsGateway — o único intermediário com o backend. Não toca o
// CameraPage legado.
//
// Rota: /recording/:cameraId/:recordingId(/:motionId)?
//   - sem motionId  → reproduz o chunk-âncora do início;
//   - com motionId  → resolve occurred_at + lead/trail e monta o clip
//     [occurred−lead, occurred+trail], reproduzindo a playlist de segmentos
//     atravessando as fronteiras dos chunks.
//
// O motor de reprodução (double-buffering + barra de controles) vive em
// components/VideoPlayer.tsx, compartilhado com o HistoryPage — esta página só resolve
// QUAIS segmentos tocar (via RecordingsGateway) e repassa pro VideoPlayer.

const gateway = new RecordingsGateway()

export default function VideoBrowserPage() {
  const { cameraId, recordingId, motionId } = useParams<{
    cameraId: string
    recordingId: string
    motionId?: string
  }>()

  const [error, setError] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<Recording | null>(null)
  const [event, setEvent] = useState<GatewayEvent | null>(null)
  const [segments, setSegments] = useState<VideoPlayerSegment[]>([])
  const [timezone, setTimezone] = useState('UTC')

  useEffect(() => {
    gateway
      .getTimezone()
      .then(setTimezone)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!cameraId || !recordingId) return
    const controller = new AbortController()
    const { signal } = controller

    // Cancela os fetches de verdade no cleanup (AbortSignal), em vez de só marcar uma
    // flag e ignorar o resultado — o StrictMode do React duplica esse efeito no mount em
    // dev (setup → cleanup → setup); sem abortar de verdade, a chamada fantasma ainda
    // dispara os fetches reais contra o backend (que pode estar gravando ativamente),
    // e nada garante que as duas respostas de listByDay batam em contagem de segmentos.
    async function load() {
      setError(null)
      try {
        // 1. Resolve o chunk-âncora → dia.
        const meta = await gateway.getRecording(cameraId!, recordingId!, signal)
        if (!meta) {
          setError('Gravação não encontrada.')
          return
        }
        const [y, m, d] = meta.date.split('-').map(Number)
        const dayRecs = await gateway.listByDay(cameraId!, new Date(y, m - 1, d), 'asc', signal)
        if (dayRecs === UNAUTHORIZED) {
          setError('Sessão expirada.')
          return
        }
        const anchorRec = dayRecs.find((r) => r.filename === meta.filename) ?? null
        setAnchor(anchorRec)
        if (!anchorRec) {
          setError('Gravação não encontrada no dia.')
          return
        }

        // 2. Sem motionId → reproduz o chunk-âncora inteiro.
        if (!motionId) {
          setEvent(null)
          setSegments([
            { src: gateway.playbackURL(anchorRec), fromSeconds: 0, toSeconds: Infinity },
          ])
          return
        }

        // 3. Com motionId → resolve occurred_at + lead/trail e monta o clip.
        const [ev, win] = await Promise.all([
          gateway.getEvent(motionId!, signal),
          gateway.getPlaybackWindow(cameraId!, signal),
        ])
        if (!ev) {
          setError('Evento não encontrado.')
          return
        }
        setEvent(ev)
        const segs = clipSegments(ev.time, dayRecs, win.lead, win.trail)
        if (segs.length === 0) {
          setError('Sem gravação cobrindo o evento.')
          setSegments([])
          return
        }
        setSegments(
          segs.map((s) => ({
            src: gateway.playbackURL(s.recording),
            fromSeconds: s.fromSeconds,
            toSeconds: s.toSeconds,
          })),
        )
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        throw err
      }
    }

    load()
    return () => controller.abort()
  }, [cameraId, recordingId, motionId])

  return (
    <Layout id="video-browser-page" footerId="video-browser-footer" contentClassName="p-6">
      <div id="video-browser-content" className="page-content space-y-4">
        <PageHeader
          id="video-browser-header"
          title="Reprodução"
          subtitle={
            event
              ? formatDateTime(event.time, timezone)
              : anchor
                ? formatDateTime(anchor.start, timezone)
                : undefined
          }
          actions={
            <Link
              id="video-browser-live-link"
              to={`/live/${cameraId}`}
              className="inline-flex items-center gap-1.5 rounded bg-danger/10 px-2.5 py-1 text-caption font-bold text-danger hover:bg-danger/20"
            >
              <span className="h-2 w-2 rounded-full bg-danger" /> Ao vivo
            </Link>
          }
        />
        {error && (
          <div
            id="video-browser-error"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
          >
            {error}
          </div>
        )}
        <VideoPlayer
          idPrefix="video-browser"
          segments={segments}
          emptyMessage="Sem gravação cobrindo o evento."
        />
      </div>
    </Layout>
  )
}
