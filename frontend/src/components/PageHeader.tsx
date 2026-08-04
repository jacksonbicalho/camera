import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  /** Título: string ou nós (ex.: LivePage compõe nome + badges de status). */
  title: ReactNode
  /** Subtítulo: string ou nós (ex.: Relatórios tem duas linhas). */
  subtitle?: ReactNode
  /** Bloco de ações alinhado à direita. */
  actions?: ReactNode
  /**
   * Quando `false`, as ações não ganham `w-full` no mobile — ficam sempre ao
   * lado do título, sem forçar quebra de linha. Default `true` (comportamento
   * padrão de toda página: ações quebram pra baixo do título quando não cabem
   * lado a lado — ver comentário abaixo). Opt-in por página; hoje só
   * `LiveViewPage` usa `false`, pra manter título + botões do header numa
   * linha só mesmo no mobile.
   */
  actionsWrap?: boolean
  id?: string
  className?: string
}

// PageHeader — cabeçalho padronizado das páginas: título (h2/text-h2) + subtítulo
// opcional (h3/text-h3) + ações à direita, com espaçamento consistente (mb-6).
// Único ponto de verdade de título/subtítulo de página do app — substitui os
// cabeçalhos ad-hoc repetidos em cada página. Um único tamanho de título — em
// todas as páginas de settings, inclusive sub-páginas por entidade (câmera/
// usuário), pra manter um padrão consistente de peso visual.
export default function PageHeader({
  title,
  subtitle,
  actions,
  actionsWrap = true,
  id,
  className,
}: PageHeaderProps) {
  return (
    <div id={id} className={cn('flex flex-wrap items-start justify-between gap-4 mb-6', className)}>
      <div className="min-w-0">
        <h2 className="text-h2 font-bold text-foreground">{title}</h2>
        {subtitle != null && (
          <h3 className="text-h3 font-semibold text-muted-foreground mt-1">{subtitle}</h3>
        )}
      </div>
      {actions && (
        // w-full no mobile — um flex item shrink-0 sem largura explícita dimensiona pelo
        // conteúdo MÁXIMO (max-content), mesmo com flex-wrap: sem um limite de largura pra
        // quebrar CONTRA, o navegador não tem motivo pra quebrar linha entre os itens, e o
        // bloco inteiro (ex.: toggle + busca + DatePicker do RecordingsPage) vaza pra fora da
        // viewport em vez de quebrar (achado real, reportado pelo navigator testando a página
        // no celular — flex-wrap sozinho, sem essa largura, não bastou; confirmado via
        // Chromium headless medindo getBoundingClientRect(), não só lendo o CSS). `sm:w-auto`
        // volta ao dimensionamento por conteúdo (lado a lado com o título) a partir do
        // breakpoint em que normalmente já cabe tudo numa linha só. `justify-start` no mobile
        // (pedido do navigator: os itens quebrados devem alinhar à ESQUERDA, acompanhando o
        // campo de busca — não à direita) e `sm:justify-end` volta ao alinhamento à direita
        // (junto do título, mesma linha) quando não há quebra.
        <div
          className={
            actionsWrap
              ? 'flex w-full flex-wrap items-center justify-start gap-2 shrink-0 sm:w-auto sm:justify-end'
              : 'flex items-center gap-2 shrink-0'
          }
        >
          {actions}
        </div>
      )}
    </div>
  )
}
