import type { ReactNode } from 'react'
import PageHeader from './PageHeader'

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
  cameraName: string
  recordingEnabled?: boolean
  /** Título fixo da página (ex.: "Histórico"). Quando omitido, o título é o
   *  nome da câmera — comportamento padrão, usado pelo Ao vivo. Quando
   *  informado, o nome da câmera (+ badge) migra pro subtítulo. */
  pageTitle?: string
  /** Ações à direita do título (ex.: `HistoryPage` usa pro `<select>` de troca
   *  de câmera — repassado direto pro `actions` do `PageHeader`). */
  actions?: ReactNode
  /** O player (Player/<video>) renderizado logo abaixo do cabeçalho. */
  children: ReactNode
}

// CameraStageHeader — cabeçalho (nome + badge REC) compartilhado entre LivePage e
// HistoryPage, seguido do player. As tabs Ao vivo/Histórico (CameraViewTabs) vivem no
// rodapé do player (footerTrailing/footerEnd), não mais aqui. Sem botão de tela cheia
// próprio — o Player (ao vivo) e o VideoPlayer (Histórico) já têm o deles.
export default function CameraStageHeader({
  idPrefix,
  cameraName,
  recordingEnabled,
  pageTitle,
  actions,
  children,
}: CameraStageHeaderProps) {
  const cameraLine = (
    <span className="flex items-center gap-2">
      {cameraName}
      <PlayerBadges idPrefix={idPrefix} recordingEnabled={recordingEnabled} />
    </span>
  )
  return (
    <>
      {/* Sem cap de largura — `.page-content` (ver CLAUDE.md "Largura do conteúdo") já é
          fluido em toda página que usa este componente (Ao vivo, Histórico), então o
          título acompanha a largura cheia, igual ao player abaixo dele. */}
      <div id={`${idPrefix}-header`} className="w-full mb-2">
        <PageHeader
          className="items-center mb-0"
          title={pageTitle ?? cameraLine}
          subtitle={pageTitle ? cameraLine : undefined}
          actions={actions}
        />
      </div>
      {children}
    </>
  )
}
