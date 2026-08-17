import { Loader2 } from './Icons'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  label?: string
}

// Spinner — indicador de carregamento genérico (mesmo ícone/animação já
// usados ad-hoc em várias páginas, ex. Player.tsx: `Loader2 ... animate-spin`),
// extraído como componente reusável em vez de repetir o markup a cada lugar
// novo (CameraCard é o 1º consumidor, história refactor/camera-list-cards).
// `role="status"` + `aria-label` (não só decorativo) permite localizar o
// spinner por acessibilidade tanto em teste (`getByRole('status')`) quanto
// pra leitor de tela.
export default function Spinner({ className, label = 'Carregando' }: SpinnerProps) {
  return <Loader2 role="status" aria-label={label} className={cn('animate-spin', className)} />
}
