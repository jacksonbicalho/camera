import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import Footer from './Footer'

interface LayoutProps {
  children: ReactNode
  id?: string
  /** Estiliza o container raiz (coluna flex de altura de viewport). */
  className?: string
  /** Estiliza o wrapper do conteúdo — é aqui que vai o padding de página, para o
   *  Footer permanecer flush nas bordas/fundo. */
  contentClassName?: string
  /** `id` repassado ao Footer, para rodapés únicos por página. */
  footerId?: string
}

// Layout — envoltório de conteúdo de página que compõe o conteúdo + o Footer no
// rodapé. Distinto do AppLayout (chrome global da app: header/sidebar/StatusBar):
// Layout é o miolo de uma página, garantindo um rodapé consistente.
export default function Layout({ children, id = 'layout', className, contentClassName, footerId }: LayoutProps) {
  return (
    // min-h-screen + flex-col: o conteúdo (flex-1) cresce e empurra o Footer para o
    // fundo da página mesmo quando o conteúdo é curto. O padding de página vai no
    // wrapper de conteúdo (contentClassName), não no root — assim o Footer fica flush.
    <div id={id} className={cn('flex min-h-screen flex-col', className)}>
      <div className={cn('flex-1', contentClassName)}>{children}</div>
      <Footer id={footerId} />
    </div>
  )
}
