import type { ReactNode } from 'react'
import PageHeader from './PageHeader'
import CameraViewTabs from './CameraViewTabs'

interface PlayerBadgesProps {
  idPrefix: string
  recordingEnabled?: boolean
}

// PlayerBadges — "REC" (condicional a recordingEnabled !== false — mesmo
// critério "ligado por padrão, só esconde se explicitamente false" usado em
// CameraPage/CamerasSettingsPage pro badge "rec off"). O status "ao vivo" já é
// sinalizado pelo dot pulsante da aba "Ao vivo" em CameraViewTabs — sem badge
// redundante aqui.
function PlayerBadges({ idPrefix, recordingEnabled }: PlayerBadgesProps) {
  if (recordingEnabled === false) return null
  return (
    <span
      id={`${idPrefix}-badge-recording`}
      className="inline-flex items-center gap-1.5 rounded-md border border-recording/20 bg-foreground/5 px-2 py-1 text-caption font-bold tracking-wide text-recording"
    >
      <span className="h-2.5 w-2.5 rounded-full bg-recording animate-pulse" aria-hidden="true" />
      REC
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
  /** O player (Player/<video>) renderizado logo abaixo do cabeçalho. */
  children: ReactNode
}

// CameraStageHeader — cabeçalho (nome + badge + tabs Ao vivo/Histórico) compartilhado
// entre LivePage e HistoryPage, seguido do player. Sem botão de tela cheia próprio —
// o Player (ao vivo) e o <video controls> (Histórico) já têm o deles.
export default function CameraStageHeader({
  idPrefix,
  cameraId,
  cameraName,
  active,
  recordingEnabled,
  children,
}: CameraStageHeaderProps) {
  return (
    <>
      <div id={`${idPrefix}-header`} className="mb-2">
        <PageHeader
          className="items-center mb-0"
          title={
            <span className="flex items-center gap-2">
              {cameraName}
              <PlayerBadges idPrefix={idPrefix} recordingEnabled={recordingEnabled} />
            </span>
          }
          actions={<CameraViewTabs cameraId={cameraId} active={active} />}
        />
      </div>
      {children}
    </>
  )
}
