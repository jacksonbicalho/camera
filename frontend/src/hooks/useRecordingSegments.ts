import { useEffect, useState } from 'react'
import {
  RecordingsGateway,
  clipSegments,
  UNAUTHORIZED,
  type Recording,
  type GatewayEvent,
} from '../lib/recordingsGateway'
import type { VideoPlayerSegment } from '../components/VideoPlayer'

const gateway = new RecordingsGateway()

// Um evento cujo instante cai dentro do chunk ainda sendo gravado nunca tem
// segmento (clipSegments pula is_recording de propósito — arquivo ainda não é
// seekável). Em vez de mostrar "sem gravação" (soa permanente), tenta de novo
// sozinho até o chunk fechar — RETRY_INTERVAL_MS entre tentativas, até
// MAX_RETRY_MS no total.
const RETRY_INTERVAL_MS = 5000
const MAX_RETRY_MS = 120000
const PENDING_MESSAGE =
  'Gravação em andamento — a gravação ainda não terminou de ser salva. Atualizando automaticamente…'
const NO_COVERAGE_MESSAGE = 'Sem gravação cobrindo o evento.'

export interface UseRecordingSegmentsResult {
  segments: VideoPlayerSegment[]
  error: string | null
  pending: boolean
  anchor: Recording | null
  event: GatewayEvent | null
  timezone: string
}

// useRecordingSegments resolve cameraId + recordingId(/motionId) em VideoPlayerSegment[] —
// extraído da lógica que vivia só dentro de VideoBrowserPage.tsx, pra ser reaproveitado por
// qualquer lugar do sistema que precise abrir o player de uma gravação (ex.:
// RecordingPlayerModal) sem duplicar a resolução (RecordingsGateway é o único intermediário
// com o backend). cameraId/recordingId nulos (ex.: modal fechado) não disparam fetch
// nenhum — segments fica vazio, sem erro.
export function useRecordingSegments(
  cameraId: string | null,
  recordingId: string | number | null,
  motionId?: string | number | null,
): UseRecordingSegmentsResult {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
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
    if (!cameraId || !recordingId) {
      // Reset síncrono ao limpar os ids (ex.: modal fechado) — não é o anti-padrão de
      // estado derivado que a regra normalmente pega, é o próprio propósito do efeito
      // (sincronizar com a mudança de cameraId/recordingId), mesmo caso já tratado com o
      // mesmo disable em VideoPlayer.tsx (startPlayback).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null)
      setPending(false)
      setAnchor(null)
      setEvent(null)
      setSegments([])
      return
    }
    const controller = new AbortController()
    const { signal } = controller
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const pendingSince = Date.now()

    // Cancela os fetches de verdade no cleanup (AbortSignal) — mesmo motivo documentado
    // originalmente em VideoBrowserPage.tsx: o StrictMode duplica o efeito no mount em dev,
    // e sem abortar de verdade a chamada fantasma ainda dispararia contra o backend.
    async function load() {
      setError(null)
      try {
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

        if (!motionId) {
          setEvent(null)
          setSegments([
            { src: gateway.playbackURL(anchorRec), fromSeconds: 0, toSeconds: Infinity },
          ])
          return
        }

        const [ev, win] = await Promise.all([
          gateway.getEvent(motionId, signal),
          gateway.getPlaybackWindow(cameraId!, signal),
        ])
        if (!ev) {
          setError('Evento não encontrado.')
          return
        }
        setEvent(ev)
        const segs = clipSegments(ev.time, dayRecs, win.lead, win.trail)
        if (segs.length === 0) {
          const windowEnd = Date.parse(ev.time) + win.trail * 1000
          const activeChunkCoversWindow = dayRecs.some(
            (r) => r.is_recording && Date.parse(r.start) <= windowEnd,
          )
          if (activeChunkCoversWindow && Date.now() - pendingSince < MAX_RETRY_MS) {
            setPending(true)
            setError(PENDING_MESSAGE)
            setSegments([])
            retryTimer = setTimeout(load, RETRY_INTERVAL_MS)
            return
          }
          setPending(false)
          setError(NO_COVERAGE_MESSAGE)
          setSegments([])
          return
        }
        setPending(false)
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
    return () => {
      controller.abort()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [cameraId, recordingId, motionId])

  return { segments, error, pending, anchor, event, timezone }
}
