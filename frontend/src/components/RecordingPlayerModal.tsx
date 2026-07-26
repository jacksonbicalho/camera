import { createPortal } from 'react-dom'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useRecordingSegments } from '../hooks/useRecordingSegments'
import { formatDateTime } from '../lib/datetime'
import VideoPlayer from './VideoPlayer'

interface RecordingPlayerModalProps {
  open: boolean
  cameraId: string | null
  recordingId: string | number | null
  motionId?: string | number | null
  onClose: () => void
}

// RecordingPlayerModal — reproduz uma gravação (ou clip de evento) num modal, sem sair da
// página que abriu (ex.: RecordingsPage). Player "agnóstico": qualquer ponto do sistema que
// tenha cameraId+recordingId(/motionId) pode reaproveitar este componente (só precisa dos 3
// ids, nenhum estado da página chamadora). Mesmo padrão de modal "de verdade" do
// ConfirmDialog (portal pra document.body + z-10000 + useEscapeKey) — evita o player ficar
// preso atrás de algum flyout aberto. A rota /recording/:cameraId/:recordingId(/:motionId)
// (VideoBrowserPage) continua existindo, intacta — é a URL compartilhável/deep-link; este
// modal é uma ENTRADA NOVA, não substitui.
export default function RecordingPlayerModal({
  open,
  cameraId,
  recordingId,
  motionId,
  onClose,
}: RecordingPlayerModalProps) {
  useEscapeKey(onClose, open)
  // cameraId/recordingId só passam pro hook quando o modal está aberto — fechado, não
  // dispara fetch nenhum (e não mantém segments velhos vivos escondidos atrás do overlay).
  const { segments, error, anchor, event, timezone } = useRecordingSegments(
    open ? cameraId : null,
    open ? recordingId : null,
    motionId,
  )

  if (!open) return null

  return createPortal(
    <div
      id="recording-player-modal"
      className="fixed inset-0 z-10000 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div className="flex w-full max-w-4xl flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-body text-foreground">
            {event
              ? formatDateTime(event.time, timezone)
              : anchor
                ? formatDateTime(anchor.start, timezone)
                : ''}
          </span>
          <button
            id="recording-player-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-faint hover:text-foreground"
          >
            ✕
          </button>
        </div>
        {error && (
          <div
            id="recording-player-modal-error"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-body text-danger"
          >
            {error}
          </div>
        )}
        <VideoPlayer
          idPrefix="recording-player"
          segments={segments}
          emptyMessage="Sem gravação cobrindo o evento."
        />
      </div>
    </div>,
    document.body,
  )
}
