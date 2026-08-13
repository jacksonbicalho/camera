import { Link } from 'react-router-dom'
import { navItemClass } from './sidebarFlyout'

interface Props {
  active: 'extensions' | 'appearance' | 'storage'
  children: React.ReactNode
}

const ITEMS: { id: Props['active']; label: string; to: string }[] = [
  { id: 'extensions', label: 'Extensões', to: '/settings/preferences/extensions' },
  { id: 'appearance', label: 'Aparência', to: '/settings/preferences/appearance' },
  { id: 'storage', label: 'Armazenamento', to: '/settings/preferences/storage' },
]

// PreferencesLayout — submenu lateral de Preferências (história
// refactor/preferencias-submenu-lateral-storage), substitui as antigas abas
// horizontais (PreferencesTabs). Só 3 links fixos e estáticos — Extensões,
// Aparência, Armazenamento — sem sub-navegação por extensão: clicar em
// "Extensões" mostra o conteúdo de TODAS as extensões na mesma página
// (`PreferencesExtensionsPage`, ver abaixo), não navega pra uma sub-rota
// própria por extensão (desenho anterior, T1/T2, revertido a pedido do
// navigator testando a branch — "devem ser os únicos links no submenu").
// Renderizado DENTRO do SettingsLayout/PageHeader de cada página, não um
// wrapper que os substitui: `children` é o conteúdo da coluna direita.
export default function PreferencesLayout({ active, children }: Props) {
  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <aside id="preferences-submenu" className="w-full shrink-0 sm:w-48">
        <nav className="flex flex-col gap-1">
          {ITEMS.map((item) => (
            <Link
              key={item.id}
              id={`preferences-nav-${item.id}`}
              to={item.to}
              aria-current={active === item.id ? 'page' : undefined}
              className={navItemClass(active === item.id, true)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
