import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import PageHeader from '../components/PageHeader'
import VideoPlayer from '../components/VideoPlayer'
import { useNotifications } from '../contexts/NotificationContext'
import { useRecordingSegments } from '../hooks/useRecordingSegments'
import { formatDateTime } from '../lib/datetime'

// VideoBrowserPage é a página nova (método estrangulamento) que reproduz gravações
// consumindo SÓ o RecordingsGateway — o único intermediário com o backend, via
// useRecordingSegments (hooks/useRecordingSegments.ts). Não toca o CameraPage legado.
//
// Rota: /recording/:cameraId/:recordingId(/:motionId)?
//   - sem motionId  → reproduz o chunk-âncora do início;
//   - com motionId  → resolve occurred_at + lead/trail e monta o clip
//     [occurred−lead, occurred+trail], reproduzindo a playlist de segmentos
//     atravessando as fronteiras dos chunks.
//
// O motor de reprodução (double-buffering + barra de controles) vive em
// components/VideoPlayer.tsx, compartilhado com o HistoryPage — esta página só resolve
// QUAIS segmentos tocar (via useRecordingSegments) e repassa pro VideoPlayer. A resolução em
// si (fetch + AbortController StrictMode-safe) era duplicada aqui e em
// RecordingPlayerModal/useRecordingSegments — consolidada nesse hook único (história
// fix/liveview-mobile-player-notificacoes, T4), que também é o ponto natural pra marcar a
// notificação do evento como lida (ver useEffect abaixo).

export default function VideoBrowserPage() {
  const { cameraId, recordingId, motionId } = useParams<{
    cameraId: string
    recordingId: string
    motionId?: string
  }>()
  const { markReadByEvent } = useNotifications()
  const { segments, error, anchor, event, timezone } = useRecordingSegments(
    cameraId ?? null,
    recordingId ?? null,
    motionId,
  )

  // Marca como lida a notificação do evento assim que ele resolve — cobre o acesso direto à
  // rota /recording/:cameraId/:recordingId/:motionId (deep-link, notificação nativa do
  // navegador). Sem motionId, `event` fica `null` e nada é marcado.
  useEffect(() => {
    if (cameraId && event) markReadByEvent(cameraId, event.time)
  }, [cameraId, event, markReadByEvent])

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
