import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import PageHeader from './PageHeader'
import CameraViewTabs from './CameraViewTabs'
import { Maximize, Minimize } from './Icons'

interface PlayerBadgesProps {
  idPrefix: string
  recordingEnabled?: boolean
}

// PlayerBadges — "GRAVANDO" (condicional a recordingEnabled !== false — mesmo
// critério "ligado por padrão, só esconde se explicitamente false" usado em
// CameraPage/CamerasSettingsPage pro badge "rec off"). O status "ao vivo" já é
// sinalizado pelo dot pulsante da aba "Ao vivo" em CameraViewTabs — sem badge
// redundante aqui.
function PlayerBadges({ idPrefix, recordingEnabled }: PlayerBadgesProps) {
  if (recordingEnabled === false) return null
  return (
    <span
      id={`${idPrefix}-badge-recording`}
      className="inline-flex items-center gap-1.5 rounded-full bg-recording/10 px-2 py-1 text-caption font-medium text-recording ring-1 ring-inset ring-recording/20"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-recording" aria-hidden="true" />
      GRAVANDO
    </span>
  )
}

interface CameraStageHeaderProps {
  /** Prefixo estável dos ids (`live`, `history`, ...). */
  idPrefix: string
  cameraId: string
  cameraName: string
  active: 'live' | 'history'
  recordingEnabled?: boolean
  /** O player (Player/<video>) renderizado dentro do wrapper de fullscreen. */
  children: ReactNode
}

// CameraStageHeader — cabeçalho (nome + badges + tabs Ao vivo/Histórico + botão de
// tela cheia) compartilhado entre LivePage e HistoryPage. O fullscreen alveja o
// wrapper {cabeçalho + player} juntos — não só o player — pra o cabeçalho poder
// flutuar sobre o vídeo em tela cheia (a Fullscreen API só exibe o elemento pedido
// e seus descendentes).
export default function CameraStageHeader({
  idPrefix,
  cameraId,
  cameraName,
  active,
  recordingEnabled,
  children,
}: CameraStageHeaderProps) {
  const [fullscreen, setFullscreen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onFsChange = () => setFullscreen(document.fullscreenElement === wrapperRef.current)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else wrapperRef.current?.requestFullscreen().catch(() => {})
  }, [])

  return (
    <div ref={wrapperRef} id={`${idPrefix}-header-and-player`} className="relative">
      <div
        id={`${idPrefix}-header`}
        data-on-video={fullscreen || undefined}
        className={cn(
          fullscreen
            ? 'absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 py-3'
            : 'mb-4',
        )}
      >
        <PageHeader
          className="items-center mb-0"
          title={
            <span className={cn('flex items-center gap-2', fullscreen && 'text-white')}>
              {cameraName}
              <PlayerBadges idPrefix={idPrefix} recordingEnabled={recordingEnabled} />
            </span>
          }
          actions={
            <>
              <CameraViewTabs cameraId={cameraId} active={active} />
              <button
                id={`${idPrefix}-fullscreen-toggle`}
                type="button"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted-foreground hover:text-foreground"
              >
                {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
            </>
          }
        />
      </div>
      {children}
    </div>
  )
}
