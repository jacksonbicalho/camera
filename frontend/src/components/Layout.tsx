import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import Footer from './Footer'
import Sidebar from './Sidebar'

interface LayoutProps {
  children: ReactNode
  id?: string
  /** Estiliza o container raiz (linha flex de altura de viewport). */
  className?: string
  /** Estiliza o wrapper do conteúdo — é aqui que vai o padding de página, para o
   *  Footer permanecer flush nas bordas/fundo. */
  contentClassName?: string
  /** `id` repassado ao Footer, para rodapés únicos por página. */
  footerId?: string
  /** Esconde o rail de navegação (ex.: player em tela cheia). */
  hideNav?: boolean
}

// Layout — envoltório de página que compõe navegação (Sidebar) + conteúdo + Footer.
// Distinto do AppLayout (chrome global: AppSidebar/header/StatusBar): Layout é o
// shell enxuto das páginas novas (LivePage, VideoBrowserPage).
export default function Layout({
  children,
  id = 'layout',
  className,
  contentClassName,
  footerId,
  hideNav = false,
}: LayoutProps) {
  return (
    // Linha flex: [Sidebar] [coluna de conteúdo]. A coluna estica na altura (align
    // stretch) e usa flex-col — o conteúdo (flex-1) empurra o Footer pro fundo. O
    // padding de página vai no wrapper de conteúdo (contentClassName), não no root,
    // pra o Footer ficar flush. O Sidebar vai num wrapper sticky+h-screen (mesmo padrão
    // do AppLayout) — sem isso, em página com conteúdo mais alto que a viewport, o rail
    // rolava junto com a página em vez de ficar fixo cobrindo a altura toda.
    <div id={id} className={cn('flex min-h-screen', className)}>
      {!hideNav && (
        <div className="sticky top-0 h-screen shrink-0 flex z-10">
          <Sidebar />
        </div>
      )}
      <div className="flex flex-1 flex-col min-w-0">
        <div className={cn('flex-1', contentClassName)}>{children}</div>
        <Footer id={footerId} />
      </div>
    </div>
  )
}
