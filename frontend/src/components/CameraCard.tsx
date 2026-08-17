import type { HTMLAttributes, ReactNode } from 'react'
import { GripVertical } from './Icons'
import { cn } from '@/lib/utils'

interface CameraCardProps extends HTMLAttributes<HTMLDivElement> {
  id: string
  thumbnail: ReactNode
  name: string
  badges?: ReactNode
  children?: ReactNode
}

// CameraCard — chrome visual análogo a ExtensionCard.tsx (mesmo "modelo",
// história refactor/camera-list-cards): bg-surface border rounded-xl p-6,
// pra CamerasSettingsPage virar uma grade lado a lado em vez de linhas
// empilhadas. `min-w-80 max-w-md` (não só `max-w-md` como ExtensionCard):
// ao contrário da extensão (nome+descrição em texto corrido, largo o
// bastante pra encostar no teto sozinho), o conteúdo da câmera é enxuto
// (nome curto + badges) e encolheria bem abaixo do teto sem um piso —
// `min-w-80` reserva espaço pra controles futuros no card (pedido do
// navigator). Diferente de ExtensionCard (ícone com halo), a câmera tem
// uma imagem real (thumbnail do snapshot) — por isso `thumbnail` é
// ReactNode, não um slot de ícone fixo. `children` é opcional (viewer não
// tem ação nenhuma; só aparece o divisor quando há `children`, diferente
// de ExtensionCard onde `children` sempre existe).
//
// Sem navegação própria (nenhum `<Link>` aqui dentro) — quem decide se o
// card navega é quem o compõe: o branch draggable (admin) não tem link
// nenhum no card (navegar por cima de uma área arrastável é ambíguo pro
// browser — um `<a>` dentro de um elemento `draggable` disputa o gesto de
// arrastar com o link nativo do <a>), a ação "Configurar" em `children` é
// a única navegação; o branch não-draggable (viewer) é o próprio chamador
// quem envolve a `CameraCard` inteira num `<Link>`. Props HTML extras
// (`...rest`, incluindo `draggable`/`onDragStart`/`onDragOver`/`onDrop`/
// `onDragEnd`) são repassadas pro `<div>` raiz — é assim que o pai pluga
// drag-and-drop sem a CameraCard precisar conhecer a lógica de
// reordenação. Quando `draggable` está presente, o cursor vira
// grab/grabbing e um ícone de arrastar aparece no hover (`group-hover`),
// só como affordance visual — o card inteiro já era a área de drag.
export default function CameraCard({
  id,
  thumbnail,
  name,
  badges,
  children,
  className,
  draggable,
  ...rest
}: CameraCardProps) {
  return (
    <div
      id={id}
      draggable={draggable}
      className={cn(
        'group relative bg-surface border border-border rounded-xl p-6 min-w-80 max-w-md',
        draggable && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      {...rest}
    >
      {draggable && (
        <GripVertical className="absolute top-4 right-4 w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      )}
      <div className="w-full aspect-video rounded-lg overflow-hidden bg-surface-2 mb-4">
        {thumbnail}
      </div>
      <p className="text-2xl font-bold text-foreground truncate">{name}</p>
      {badges && <div className="flex flex-wrap items-center gap-1.5 mt-2">{badges}</div>}
      {children && (
        <>
          <div className="border-t border-border my-4" />
          <div className="flex items-center gap-2">{children}</div>
        </>
      )}
    </div>
  )
}
