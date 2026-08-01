import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../contexts/NotificationContext'
import { useDraggableResizable, type ResizeCorner } from '../hooks/useDraggableResizable'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useRecordingSegments } from '../hooks/useRecordingSegments'
import { formatDateTime } from '../lib/datetime'
import { X } from './Icons'
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
// Abaixo desta largura, o modal usa o modo celular (T5, história
// fix/liveview-mobile-player-notificacoes): largura total da tela (sem margem), altura NÃO
// travada por MODAL_CHROME_HEIGHT (estimativa fixa que corta o rodapé de controles em telas
// estreitas — o cabeçalho/rodapé reais passam a quebrar linha nessa largura) e sem alças de
// resize (a caixa já ocupa a tela inteira; redimensionar não faz sentido). Mesmo breakpoint de
// `clampColsForViewport` (lib/liveViewLayout.ts). Lido uma vez por render (não há listener de
// `resize` novo aqui) — girar o aparelho com o modal já aberto não reavalia o modo, escopo
// deliberado (ver `## Revisão` da story).
const MOBILE_BREAKPOINT = 640

// RESIZE_HANDLE_SPECS — uma entrada por quina: posição (Tailwind), cursor (direção da
// diagonal) e o ângulo do gradiente que desenha as 3 linhas diagonais (nwse: topo-esquerda/
// baixo-direita; nesw: topo-direita/baixo-esquerda).
const RESIZE_HANDLE_SPECS: {
  corner: ResizeCorner
  position: string
  cursor: string
  angle: number
}[] = [
  { corner: 'tl', position: 'top-0 left-0', cursor: 'cursor-nwse-resize', angle: 315 },
  { corner: 'tr', position: 'top-0 right-0', cursor: 'cursor-nesw-resize', angle: 45 },
  { corner: 'bl', position: 'bottom-0 left-0', cursor: 'cursor-nesw-resize', angle: 225 },
  { corner: 'br', position: 'bottom-0 right-0', cursor: 'cursor-nwse-resize', angle: 135 },
]

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
  const { markReadByEvent } = useNotifications()
  useEscapeKey(onClose, open)
  // cameraId/recordingId só passam pro hook quando o modal está aberto — fechado, não
  // dispara fetch nenhum (e não mantém segments velhos vivos escondidos atrás do overlay).
  const { segments, error, anchor, event, timezone } = useRecordingSegments(
    open ? cameraId : null,
    open ? recordingId : null,
    motionId,
  )
  const isMobile = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  const { style, dragHandleProps, resizeHandleProps } = useDraggableResizable({
    aspectRatio: VIDEO_ASPECT_RATIO,
    initialWidth: MODAL_INITIAL_WIDTH,
    minWidth: MODAL_MIN_WIDTH,
    chromeHeight: MODAL_CHROME_HEIGHT,
    resizable: !isMobile,
    lockAspectRatio: !isMobile,
    viewportMargin: isMobile ? 0 : undefined,
  })
  // dragHandleProps não é espalhado no cabeçalho no mobile (abaixo) — o clamp vertical do
  // arraste (useDraggableResizable.ts) ainda usa a MESMA altura estimada (aspectRatio+
  // chromeHeight) que este ticket já provou estar errada em telas estreitas (cabeçalho/
  // rodapé reais quebram linha e ficam mais altos que a estimativa); arrastar o cabeçalho pra
  // baixo empurraria a caixa (mais alta na realidade) pra além do fundo da viewport,
  // reproduzindo o mesmo corte que lockAspectRatio=false corrigiu no layout inicial — achado
  // do code review. Sem drag, a caixa fica onde nasceu (top: 0, full-bleed), suficiente pro
  // que foi pedido (largura total + sem corte); consertar o clamp em si (medir a altura real)
  // é trabalho de hook, fora do escopo mínimo deste ticket.

  // Marca como lida a notificação do evento assim que ele resolve (mesmo timing que o clique
  // direto no sino já usava: antes mesmo do vídeo carregar de fato — os players autoplay
  // mudo por padrão) — cobre TODOS os chamadores deste modal (sino, RecordingsPage/Momentos),
  // não só quem já chamava markRead no próprio clique. Sem motionId (reprodução do chunk
  // inteiro, sem evento associado), `event` fica `null` e nada é marcado.
  useEffect(() => {
    if (cameraId && event) markReadByEvent(cameraId, event.time)
  }, [cameraId, event, markReadByEvent])

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
          className="flex cursor-move select-none items-center justify-between border-b border-border px-3 py-1.5"
          {...(isMobile ? {} : dragHandleProps)}
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
              className="border-primary/40 text-primary hover:border-primary hover:bg-primary/10 hover:text-primary"
            >
              Visualizar no histórico
            </Button>
            <button
              id="recording-player-modal-close"
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
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
        {/* Alças de redimensionar — uma por quina (T3, história
            fix/liveview-mobile-player-notificacoes), sempre por cima do conteúdo (z-10) pra
            não ficarem atrás do rodapé de controles do VideoPlayer. Mesmas 3 linhas diagonais
            decrescentes de sempre (via gradiente repetido), rotacionadas conforme a diagonal
            de cada quina (nwse: topo-esquerda/baixo-direita; nesw: topo-direita/baixo-
            esquerda) — mesmo afordance visual convencional de "canto redimensionável", sem
            depender de nenhum ícone novo (Icons.tsx só tem paths extraídos do lucide de
            verdade; inventar um path novo aqui arriscaria não bater com o SVG real).
            `resizeHandleProps` é `null` no celular (T5) — nenhuma alça é renderizada. */}
        {resizeHandleProps &&
          RESIZE_HANDLE_SPECS.map(({ corner, position, cursor, angle }) => (
            <div
              key={corner}
              id={`recording-player-modal-resize-handle-${corner}`}
              aria-hidden="true"
              className={`absolute z-10 h-4 w-4 opacity-40 hover:opacity-70 ${position} ${cursor}`}
              style={{
                background: `repeating-linear-gradient(${angle}deg, transparent 0, transparent 2px, currentColor 2px, currentColor 3px)`,
                color: 'var(--color-border)',
              }}
              {...resizeHandleProps[corner]}
            />
          ))}
      </div>
    </div>,
    document.body,
  )
}
