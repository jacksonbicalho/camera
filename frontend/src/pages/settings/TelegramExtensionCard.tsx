import { useEffect, useState } from 'react'
import { authHeaders } from '../../auth'
import { Button } from '@/components/ui/button'
import { TelegramIcon } from '@/components/TelegramIcon'

interface Extension {
  id: string
  name: string
  description: string
  available: boolean
  active: boolean
}

// TelegramExtensionCard — conteúdo da extensão Telegram, renderizado dentro
// de PreferencesExtensionsPage (história refactor/preferencias-submenu-lateral-storage,
// T4 — antes era uma página própria, TelegramExtensionPage, removida quando o
// submenu deixou de ter sub-rota por extensão). Não existe endpoint de
// extensão única — busca a lista inteira (GET /api/settings/extensions) e
// filtra por id. Estado local (staged): o checkbox só persiste ao clicar
// "Aplicar" (PUT /api/settings/extensions/telegram).
export default function TelegramExtensionCard() {
  const [ext, setExt] = useState<Extension | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [activeStaged, setActiveStaged] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings/extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((list: Extension[]) => {
        const found = list?.find((e) => e.id === 'telegram') ?? null
        setExt(found)
        setActiveStaged(found?.active ?? false)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  function handleApply() {
    setSaving(true)
    fetch('/api/settings/extensions/telegram', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: activeStaged }),
    })
      .catch(() => {})
      .finally(() => setSaving(false))
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (!ext) return <p className="text-sm text-muted-foreground">Extensão não encontrada.</p>

  return (
    <div
      id="telegram-extension-card"
      className="bg-surface border border-border rounded-lg p-5 max-w-md"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <TelegramIcon className="h-4 w-4 shrink-0" />
        {ext.name}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">{ext.description}</p>
      {ext.available ? (
        <>
          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <input
              type="checkbox"
              id="telegram-active"
              checked={activeStaged}
              onChange={(e) => setActiveStaged(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm text-foreground">Ativado</span>
          </label>
          <div className="flex justify-end">
            <Button id="telegram-apply" onClick={handleApply} disabled={saving}>
              {saving ? 'Aplicando...' : 'Aplicar'}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Extensão não permitida nesta instância.</p>
      )}
    </div>
  )
}
