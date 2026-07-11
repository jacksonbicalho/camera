import type { ReactNode } from 'react'

interface PlayerFooterProps {
  id: string
  title: string
  children?: ReactNode
}

// PlayerFooter — rodapé compartilhado por todo player (nome da câmera à esquerda + ações
// opcionais à direita, ex.: mudo/tela cheia). Theme-aware (bg-surface/text-foreground/
// border-border) — nunca cor fixa tipo bg-black, mesmo sendo "chrome" de vídeo.
export default function PlayerFooter({ id, title, children }: PlayerFooterProps) {
  return (
    <div
      id={id}
      className="flex items-center justify-between gap-2 border-t border-border bg-surface px-3 py-2 text-foreground"
    >
      <span className="truncate text-body">{title}</span>
      {children && (
        <div id={`${id}-actions`} className="flex shrink-0 items-center gap-1">
          {children}
        </div>
      )}
    </div>
  )
}
