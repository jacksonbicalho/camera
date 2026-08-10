import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authHeaders } from '../auth'

interface Extension {
  id: string
  name: string
  category: string
}

interface Props {
  active: string
  children: React.ReactNode
}

// PreferencesLayout — submenu lateral de Preferências (história
// refactor/preferencias-submenu-lateral-storage), substitui as antigas abas
// horizontais (PreferencesTabs): grupo "Extensões" com sub-cabeçalhos por
// categoria (1 item de navegação por extensão, na ordem em que a API devolve
// — hoje Notificações › Telegram, Retenção › S3) + itens fixos
// Aparência/Armazenamento. `active` é o id do item atual (id da extensão, ou
// "appearance"/"storage") — mesmo papel do `active` de PreferencesTabs.
// Renderizado DENTRO do SettingsLayout/PageHeader de cada página, não um
// wrapper que os substitui: `children` é o conteúdo da coluna direita.
export default function PreferencesLayout({ active, children }: Props) {
  const [extensions, setExtensions] = useState<Extension[]>([])

  useEffect(() => {
    fetch('/api/settings/extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((list: Extension[]) => setExtensions(Array.isArray(list) ? list : []))
      .catch(() => {})
  }, [])

  const categories: { category: string; items: Extension[] }[] = []
  for (const ext of extensions) {
    let group = categories.find((c) => c.category === ext.category)
    if (!group) {
      group = { category: ext.category, items: [] }
      categories.push(group)
    }
    group.items.push(ext)
  }

  function navLinkClass(itemActive: boolean) {
    return `block px-3 py-1.5 text-sm rounded-md transition-colors ${
      itemActive
        ? 'bg-surface-2 text-foreground font-medium'
        : 'text-muted-foreground hover:text-foreground hover:bg-surface-2'
    }`
  }

  return (
    <div className="flex flex-col gap-6 sm:flex-row">
      <aside id="preferences-submenu" className="w-full shrink-0 sm:w-48">
        {categories.length > 0 && (
          <div className="mb-4">
            <p
              id="preferences-nav-extensions-header"
              className="px-3 text-xs font-semibold uppercase tracking-wider text-faint mb-1"
            >
              Extensões
            </p>
            {categories.map(({ category, items }) => (
              <div key={category} className="mb-2">
                <p className="px-3 text-xs text-muted-foreground mb-0.5">{category}</p>
                {items.map((ext) => (
                  <Link
                    key={ext.id}
                    id={`preferences-nav-${ext.id}`}
                    to={`/settings/preferences/extensions/${ext.id}`}
                    aria-current={active === ext.id ? 'page' : undefined}
                    className={navLinkClass(active === ext.id)}
                  >
                    {ext.name}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
        <Link
          id="preferences-nav-appearance"
          to="/settings/preferences/appearance"
          aria-current={active === 'appearance' ? 'page' : undefined}
          className={navLinkClass(active === 'appearance')}
        >
          Aparência
        </Link>
        <Link
          id="preferences-nav-storage"
          to="/settings/preferences/storage"
          aria-current={active === 'storage' ? 'page' : undefined}
          className={navLinkClass(active === 'storage')}
        >
          Armazenamento
        </Link>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
