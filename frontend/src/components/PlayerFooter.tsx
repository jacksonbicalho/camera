import type { ReactNode } from 'react'

interface PlayerFooterProps {
  id: string
  /** Nome da câmera. Ausente = modo freeform: renderiza só `children`, sem a linha
   * título+ações — usado pelo VideoPlayer, cujo rodapé tem layout próprio (barra de
   * progresso + linhas de controles) e já mostra o nome no cabeçalho da página. */
  title?: string
  children?: ReactNode
}

// PlayerFooter — rodapé compartilhado por todo player. Com `title`: nome da câmera à
// esquerda + ações opcionais à direita (Ao vivo/preview do grid). Sem `title`: container
// theme-aware "burro" pro chamador montar o próprio layout (VideoPlayer). Theme-aware
// (bg-surface/text-foreground/border-border) — nunca cor fixa tipo bg-black, mesmo sendo
// "chrome" de vídeo.
export default function PlayerFooter({ id, title, children }: PlayerFooterProps) {
  if (title === undefined) {
    return (
      <div id={id} className="border-t border-border bg-surface text-foreground">
        {children}
      </div>
    )
  }
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
