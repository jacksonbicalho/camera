import type { ReactNode } from 'react'
import PageHeader from './PageHeader'
import CameraViewTabs from './CameraViewTabs'

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
      <div id={`${idPrefix}-header`} className="mb-4">
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
