import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { BarChart2, Cctv, Film, Settings } from './Icons'

interface NavItem {
  id: string
  to: string
  label: string
  icon: ReactNode
  /** `/` só fica ativo na rota exata (senão casaria toda rota). */
  end?: boolean
}

const items: NavItem[] = [
  { id: 'sidebar-inicio', to: '/', label: 'Início', icon: <Cctv className="h-5 w-5" />, end: true },
  { id: 'sidebar-gravacoes', to: '/recordings', label: 'Gravações', icon: <Film className="h-5 w-5" /> },
  { id: 'sidebar-relatorios', to: '/reports', label: 'Relatórios', icon: <BarChart2 className="h-5 w-5" /> },
  { id: 'sidebar-config', to: '/settings/cameras', label: 'Configurações', icon: <Settings className="h-5 w-5" /> },
]

// Sidebar — rail de navegação enxuto para o Layout (páginas novas). Só links: sem
// sino, user-menu, painéis ou contextos pesados — esses vivem no AppSidebar (o
// sidebar completo do AppLayout).
export default function Sidebar() {
  return (
    <nav
      id="sidebar"
      aria-label="Navegação"
      className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-3"
    >
      {items.map(item => (
        <NavLink
          key={item.id}
          id={item.id}
          to={item.to}
          end={item.end}
          title={item.label}
          aria-label={item.label}
          className={({ isActive }) =>
            cn(
              'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
              isActive
                ? 'bg-primary text-on-primary'
                : 'text-muted hover:bg-surface-2 hover:text-foreground',
            )
          }
        >
          {item.icon}
        </NavLink>
      ))}
    </nav>
  )
}
