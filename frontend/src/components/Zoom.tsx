import type { PlayerZoom } from '../hooks/usePlayerZoom'
import { ZoomIn, ZoomOut } from './Icons'

interface ZoomProps {
  id: string
  zoom: PlayerZoom
}

const buttonClassName =
  'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground'

// Zoom — controle de zoom explícito e sempre visível no rodapé de um player (Player.tsx e
// VideoPlayer.tsx, ambos já usam usePlayerZoom por baixo) — [ − 100% + ]. Substitui
// PlayerControlsOverlay (chip que só aparecia sobre o vídeo quando já estava zoomado, sem
// zoom in/out por clique): mesma informação (fator atual, reset) + zoom por clique, sempre
// visível — não só quando já zoomado. Só UI; a lógica de zoom em si (matemática, limites)
// continua inteira em usePlayerZoom/lib/playerZoom.ts, não duplicada aqui.
export default function Zoom({ id, zoom }: ZoomProps) {
  return (
    <div className="flex items-center gap-0.5">
      {/* Divisor explícito (não `divide-x`) — o reset de borda do <button> zera
          `border-left-width` do utilitário `divide-x`, mesmo padrão de HistoryPage.tsx.
          Flanqueia o grupo inteiro (não separa os 3 elementos entre si) — agrupa, não
          fragmenta. */}
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      <button
        id={`${id}-zoom-out`}
        type="button"
        onClick={zoom.zoomOut}
        disabled={!zoom.canZoomOut}
        aria-label="Diminuir zoom"
        className={buttonClassName}
      >
        <ZoomOut className="h-4 w-4" />
      </button>
      <button
        id={`${id}-zoom-level`}
        type="button"
        onClick={zoom.reset}
        disabled={!zoom.isZoomed}
        aria-label="Redefinir zoom"
        className="min-w-10 rounded px-1 text-center text-caption tabular-nums text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
      >
        {Math.round(zoom.scale * 100)}%
      </button>
      <button
        id={`${id}-zoom-in`}
        type="button"
        onClick={zoom.zoomIn}
        disabled={!zoom.canZoomIn}
        aria-label="Aumentar zoom"
        className={buttonClassName}
      >
        <ZoomIn className="h-4 w-4" />
      </button>
      <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
    </div>
  )
}
