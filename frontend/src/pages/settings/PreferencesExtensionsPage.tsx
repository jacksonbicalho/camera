import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import PreferencesTabs from '../../components/PreferencesTabs'
import { authHeaders } from '../../auth'

interface Extension {
  id: string
  name: string
  category: string
  description: string
  available: boolean
  active: boolean
}

// Só extensões com tela própria ganham o botão "Configurar" — Telegram não
// tem nada além do toggle "Ativo" nesta história.
const CONFIGURE_ROUTES: Record<string, string> = {
  s3: '/settings/preferences/extensions/s3',
}

export default function PreferencesExtensionsPage() {
  const navigate = useNavigate()
  const [extensions, setExtensions] = useState<Extension[] | null>(null)

  const load = () =>
    fetch('/api/settings/extensions', { headers: authHeaders() })
      .then((res) => res.json())
      .then((data: Extension[]) => setExtensions(data))
      .catch(() => {})

  useEffect(() => {
    load()
  }, [])

  function toggleActive(ext: Extension, active: boolean) {
    setExtensions((list) => (list ?? []).map((e) => (e.id === ext.id ? { ...e, active } : e)))
    fetch(`/api/settings/extensions/${ext.id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    }).catch(() => {})
  }

  return (
    <SettingsLayout id="preferences-extensions-page" footerId="preferences-extensions-footer">
      <PageHeader
        title="Preferências"
        subtitle="Integrações opcionais disponíveis para esta instância."
      />
      <PreferencesTabs active="extensions" />
      <div className="flex flex-col gap-4">
        {extensions?.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma extensão configurada.</p>
        )}
        {extensions?.map((ext) => (
          <div
            key={ext.id}
            id={`extension-card-${ext.id}`}
            data-testid={`extension-card-${ext.id}`}
            className={`bg-surface border border-border rounded-lg p-5 ${
              ext.available ? '' : 'opacity-50'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{ext.name}</span>
                  <span className="text-xs text-muted-foreground bg-surface-2 rounded px-2 py-0.5">
                    {ext.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{ext.description}</p>
              </div>
              {ext.available && (
                <div className="flex items-center gap-3 shrink-0">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id={`extension-${ext.id}-active`}
                      checked={ext.active}
                      onChange={(e) => toggleActive(ext, e.target.checked)}
                      className="accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">Ativo</span>
                  </label>
                  {CONFIGURE_ROUTES[ext.id] && (
                    <button
                      id={`extension-${ext.id}-configure`}
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => navigate(CONFIGURE_ROUTES[ext.id])}
                    >
                      Configurar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SettingsLayout>
  )
}
