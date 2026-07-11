import type { PlayerZoom } from '../hooks/usePlayerZoom'
import { ZoomOut } from './Icons'

interface PlayerControlsOverlayProps {
  id: string
  zoom: PlayerZoom
}

// PlayerControlsOverlay — controle de reset de zoom sobre o vídeo (só aparece com zoom
// ativo, no hover do container (`group`) ou com foco dentro dele). O botão de tela cheia
// que vivia aqui foi movido para o rodapé do player (PlayerFooter) — ver Player.tsx.
export default function PlayerControlsOverlay({ id, zoom }: PlayerControlsOverlayProps) {
  if (!zoom.isZoomed) return null
  return (
    <div className="absolute bottom-2 right-2 z-20 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button
        id={`${id}-zoom-reset`}
        type="button"
        onClick={zoom.reset}
        aria-label="Redefinir zoom"
        className="flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-caption tabular-nums text-white hover:bg-black/70"
      >
        <ZoomOut className="h-3.5 w-3.5" /> {zoom.scale.toFixed(1)}×
      </button>
    </div>
  )
}
