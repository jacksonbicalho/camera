import { NavLink } from 'react-router-dom'

interface NavItem {
  id?: string
  to: string
  label: string
}

interface SectionNavListProps {
  items: NavItem[]
  ariaLabel: string
  end?: boolean
}

// SectionNavList — lista vertical de NavLinks compartilhada entre layouts com
// coluna de navegação persistente (ProfileLayout, SettingsLayout). Extraída pra
// evitar duplicar a mesma marcação/className em cada layout que precisar dessa
// coluna.
export default function SectionNavList({ items, ariaLabel, end = false }: SectionNavListProps) {
  return (
    <nav className="w-full" aria-label={ariaLabel}>
      <ul className="flex flex-col gap-1">
        {items.map(({ id, to, label }) => (
          <li key={to}>
            <NavLink
              id={id}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-surface-2 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                }`
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
