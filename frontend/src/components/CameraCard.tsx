import type { HTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface CameraCardProps extends HTMLAttributes<HTMLDivElement> {
  id: string
  href: string
  thumbnail: ReactNode
  name: string
  badges?: ReactNode
  children?: ReactNode
}

// CameraCard — chrome visual análogo a ExtensionCard.tsx (mesmo "modelo",
// história refactor/camera-list-cards): bg-surface border rounded-xl p-6
// max-w-md, pra CamerasSettingsPage virar uma grade lado a lado em vez de
// linhas empilhadas. Diferente de ExtensionCard (ícone com halo), a câmera
// tem uma imagem real (thumbnail do snapshot) — por isso `thumbnail` é
// ReactNode, não um slot de ícone fixo. `children` é opcional (viewer não
// tem ação nenhuma; só aparece o divisor quando há `children`, diferente
// de ExtensionCard onde `children` sempre existe). Props HTML extras
// (`...rest`) são repassadas pro <div> raiz — é assim que o pai pluga
// drag-and-drop (draggable/onDragStart/onDragOver/onDrop/onDragEnd) sem a
// CameraCard precisar conhecer a lógica de reordenação.
export default function CameraCard({
  id,
  href,
  thumbnail,
  name,
  badges,
  children,
  className,
  ...rest
}: CameraCardProps) {
  return (
    <div
      id={id}
      className={cn('bg-surface border border-border rounded-xl p-6 max-w-md', className)}
      {...rest}
    >
      <Link to={href} className="block">
        <div className="w-full aspect-video rounded-lg overflow-hidden bg-surface-2 mb-4">
          {thumbnail}
        </div>
        <p className="text-2xl font-bold text-foreground truncate">{name}</p>
      </Link>
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
