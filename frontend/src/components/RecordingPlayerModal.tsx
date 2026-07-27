import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useDraggableResizable } from '../hooks/useDraggableResizable'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useRecordingSegments } from '../hooks/useRecordingSegments'
import { formatDateTime } from '../lib/datetime'
import { Button } from './ui/button'
import VideoPlayer from './VideoPlayer'

// Proporção do vídeo (aspect-video, igual à classe Tailwind que VideoPlayer já usa no
// wrapper do <video>) + a altura "chrome" fixa que sobra por cima dela nesta caixa
// (cabeçalho de arrastar + padding do corpo + rodapé de controles do VideoPlayer) — medida
// contra a estrutura renderizada de verdade (cabeçalho ~45px, padding do corpo 24px, rodapé
// do VideoPlayer ~65px). Não escala com o resize: só a área do vídeo (16:9) cresce/encolhe.
const VIDEO_ASPECT_RATIO = 16 / 9
const MODAL_CHROME_HEIGHT = 140
const MODAL_INITIAL_WIDTH = 896 // mesma largura que `max-w-4xl` tinha antes (56rem = 896px)
const MODAL_MIN_WIDTH = 360

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
  const navigate = useNavigate()
  useEscapeKey(onClose, open)
  // cameraId/recordingId só passam pro hook quando o modal está aberto — fechado, não
  // dispara fetch nenhum (e não mantém segments velhos vivos escondidos atrás do overlay).
  const { segments, error, anchor, event, timezone } = useRecordingSegments(
    open ? cameraId : null,
    open ? recordingId : null,
    motionId,
  )
  const { style, dragHandleProps, resizeHandleProps } = useDraggableResizable({
    aspectRatio: VIDEO_ASPECT_RATIO,
    initialWidth: MODAL_INITIAL_WIDTH,
    minWidth: MODAL_MIN_WIDTH,
    chromeHeight: MODAL_CHROME_HEIGHT,
  })

  if (!open) return null

  // Reaproveita a mesma lógica de abertura de /recording/:cameraId/:recordingId/:motionId —
  // o Histórico agora sabe abrir já na janela recortada do evento quando :motionId vem na
  // URL (ver HistoryPage.tsx), então navegar pra lá preserva o mesmo contexto que este modal
  // já mostrava.
  function viewInHistory() {
    navigate(`/history/${cameraId}/${recordingId}${motionId ? `/${motionId}` : ''}`)
    onClose()
  }

  return createPortal(
    <div
      id="recording-player-modal"
      className="fixed inset-0 z-10000 bg-black/60"
      onClick={onClose}
    >
      {/* Caixa arrastável/redimensionável: `style` (position/top/left/width/height) vem de
          useDraggableResizable — não depende mais do backdrop centralizar por flex. */}
      <div
        id="recording-player-modal-box"
        style={style}
        className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-2 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="recording-player-modal-header"
          className="flex cursor-move items-center justify-between border-b border-border px-3 py-1.5"
          {...dragHandleProps}
        >
          <span className="text-caption text-foreground">
            {event
              ? formatDateTime(event.time, timezone)
              : anchor
                ? formatDateTime(anchor.start, timezone)
                : 'Reprodução'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              id="recording-player-view-in-history"
              type="button"
              variant="outline"
              size="sm"
              onClick={viewInHistory}
            >
              Visualizar no histórico
            </Button>
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
        </div>
        <div className="flex flex-col gap-3 p-3">
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
        {/* Alça de redimensionar — canto inferior direito, sempre por cima do conteúdo
            (z-10) pra não ficar atrás do rodapé de controles do VideoPlayer. 3 linhas
            diagonais decrescentes (via gradiente repetido), mesmo afordance visual
            convencional de "canto redimensionável" — sem depender de nenhum ícone novo
            (Icons.tsx só tem paths extraídos do lucide de verdade; inventar um path novo
            aqui arriscaria não bater com o SVG real). */}
        <div
          id="recording-player-modal-resize-handle"
          aria-hidden="true"
          className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-nwse-resize opacity-40 hover:opacity-70"
          style={{
            background:
              'repeating-linear-gradient(135deg, transparent 0, transparent 2px, currentColor 2px, currentColor 3px)',
            color: 'var(--color-border)',
          }}
          {...resizeHandleProps}
        />
      </div>
    </div>,
    document.body,
  )
}
