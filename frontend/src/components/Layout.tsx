import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import Footer from './Footer'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

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

// Layout — envoltório de página que compõe `TopBar` (barra full-width, logo +
// UserMenu) + navegação (Sidebar) + conteúdo + Footer. Distinto do AppLayout
// (chrome global: AppSidebar/header/StatusBar): Layout é o shell enxuto das
// páginas novas (LivePage, VideoBrowserPage).
export default function Layout({
  children,
  id = 'layout',
  className,
  contentClassName,
  footerId,
  hideNav = false,
}: LayoutProps) {
  return (
    // Coluna: [TopBar] em cima, depois uma linha [Sidebar] [coluna de conteúdo].
    // TopBar é `sticky top-0` (ver TopBar.tsx); o Sidebar gruda logo abaixo dela
    // (`sticky top-14`, altura `calc(100vh-3.5rem)` — 3.5rem = h-14 da TopBar),
    // mesmo padrão de sempre (rail fixo cobrindo a altura toda, mesmo em página
    // com conteúdo mais alto que a viewport), só descontando a barra do topo. A
    // coluna de conteúdo estica na altura (align stretch) e usa flex-col — o
    // conteúdo (flex-1) empurra o Footer pro fundo. O padding de página vai no
    // wrapper de conteúdo (contentClassName), não no root, pra o Footer ficar
    // flush.
    <div id={id} className={cn('flex min-h-screen flex-col', className)}>
      {!hideNav && <TopBar />}
      <div className="flex flex-1">
        {!hideNav && (
          <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] shrink-0 z-10">
            <Sidebar />
          </div>
        )}
        <div className="flex flex-1 flex-col min-w-0">
          <div className={cn('flex-1', contentClassName)}>{children}</div>
          <Footer id={footerId} />
        </div>
      </div>
    </div>
  )
}
