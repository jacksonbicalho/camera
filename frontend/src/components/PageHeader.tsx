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

// PageHeader — cabeçalho padronizado das páginas: título + subtítulo opcional +
// ações à direita, com espaçamento consistente (gap título↔subtítulo mt-2, mb-6).
// Substitui os cabeçalhos ad-hoc repetidos em cada página. Um único tamanho de
// título (text-2xl) — em todas as páginas de settings, inclusive sub-páginas por
// entidade (câmera/usuário), pra manter um padrão consistente de peso visual.
export default function PageHeader({ title, subtitle, actions, id, className }: PageHeaderProps) {
  return (
    <div id={id} className={cn('flex items-start justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        {subtitle != null && <div className="text-sm text-muted-foreground mt-2">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
