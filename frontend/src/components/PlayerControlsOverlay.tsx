import type { PlayerZoom } from '../hooks/usePlayerZoom'
import { Maximize, ZoomOut } from './Icons'

interface PlayerControlsOverlayProps {
  id: string
  zoom: PlayerZoom
  // Opcional: quando ausente, o botão de tela cheia não renderiza — usado pela
  // HistoryPage, cujo <video controls> nativo já tem o seu (evita duplicar).
  onToggleFullscreen?: () => void
}

// PlayerControlsOverlay — controles sobre o vídeo (reset de zoom quando ativo + tela
// cheia opcional), extraído do Player.tsx (ao vivo) para ser reaproveitado também pelo
// player de Histórico. Só aparece no hover do container (`group`) ou com foco dentro dele.
export default function PlayerControlsOverlay({
  id,
  zoom,
  onToggleFullscreen,
}: PlayerControlsOverlayProps) {
  return (
    <div className="absolute bottom-2 right-2 z-20 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      {zoom.isZoomed && (
        <button
          id={`${id}-zoom-reset`}
          type="button"
          onClick={zoom.reset}
          aria-label="Redefinir zoom"
          className="flex items-center gap-1 rounded bg-black/50 px-2 py-1 text-caption tabular-nums text-white hover:bg-black/70"
        >
          <ZoomOut className="h-3.5 w-3.5" /> {zoom.scale.toFixed(1)}×
        </button>
      )}
      {onToggleFullscreen && (
        <button
          id={`${id}-fullscreen`}
          type="button"
          onClick={onToggleFullscreen}
          aria-label="Tela cheia"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
        >
          <Maximize className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
