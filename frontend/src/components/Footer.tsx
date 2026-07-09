import { cn } from '@/lib/utils'

interface FooterProps {
  id?: string
  className?: string
}

// Footer — rodapé de página estático (fatia inicial). Presentacional, sem props
// de conteúdo por ora; a parametrização entra numa fatia futura. O `id` default
// é sobrescrevível para reúso em múltiplas páginas com ids únicos e estáveis.
export default function Footer({ id = 'footer', className }: FooterProps) {
  return (
    <footer
      id={id}
      className={cn(
        'border-t border-border bg-surface px-4 py-3 text-center text-caption text-muted',
        className,
      )}
    >
      © {new Date().getFullYear()} os-camera · Monitoramento
    </footer>
  )
}
