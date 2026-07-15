import type { ReactNode } from 'react'

interface PlayerFooterProps {
  id: string
  /** Nome da câmera, mostrado à esquerda quando presente (modo linha). Opcional mesmo no
   * modo linha — o Ao Vivo usa o rodapé só para mudo/tela cheia/abas, sem repetir o nome
   * que já aparece no cabeçalho da página. */
  title?: string
  /** true = sem layout em linha (sem flex/padding) — o chamador monta o próprio layout
   * dentro do rodapé (usado pelo VideoPlayer, que tem barra de progresso + linhas de
   * controles próprias e já mostra o nome no cabeçalho da página). */
  freeform?: boolean
  children?: ReactNode
}

// PlayerFooter — rodapé compartilhado por todo player. Modo linha (`freeform` ausente/false):
// nome opcional à esquerda + ações à direita (`ml-auto` explícito no wrapper — não depende de
// `justify-between` entre dois itens condicionais, já que o nome pode estar ausente). Modo
// freeform (VideoPlayer): container theme-aware "burro" pro chamador montar o próprio layout.
// Theme-aware (bg-surface/text-foreground/border-border) — nunca cor fixa tipo bg-black, mesmo
// sendo "chrome" de vídeo.
export default function PlayerFooter({ id, title, freeform, children }: PlayerFooterProps) {
  if (freeform) {
    return (
      <div id={id} className="border-t border-border bg-surface text-foreground">
        {children}
      </div>
    )
  }
  return (
    <div
      id={id}
      className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2 text-foreground"
    >
      {title && <span className="truncate text-body">{title}</span>}
      {children && (
        <div id={`${id}-actions`} className="ml-auto flex shrink-0 items-center gap-1">
          {children}
        </div>
      )}
    </div>
  )
}
