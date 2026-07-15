import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  /** Título: string ou nós (ex.: LivePage compõe nome + badges de status). */
  title: ReactNode
  /** Subtítulo: string ou nós (ex.: Relatórios tem duas linhas). */
  subtitle?: ReactNode
  /** Bloco de ações alinhado à direita. */
  actions?: ReactNode
  id?: string
  className?: string
}

// PageHeader — cabeçalho padronizado das páginas: título (h2/text-h2) + subtítulo
// opcional (h3/text-h3) + ações à direita, com espaçamento consistente (mb-6).
// Único ponto de verdade de título/subtítulo de página do app — substitui os
// cabeçalhos ad-hoc repetidos em cada página. Um único tamanho de título — em
// todas as páginas de settings, inclusive sub-páginas por entidade (câmera/
// usuário), pra manter um padrão consistente de peso visual.
export default function PageHeader({ title, subtitle, actions, id, className }: PageHeaderProps) {
  return (
    <div id={id} className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        <h2 className="text-h2 font-bold text-foreground">{title}</h2>
        {subtitle != null && (
          <h3 className="text-h3 font-semibold text-muted-foreground mt-1">{subtitle}</h3>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
