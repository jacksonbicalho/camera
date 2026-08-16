import { useEffect, useState } from 'react'
import { authHeaders } from '../../auth'
import { Button } from '@/components/ui/button'
import { TelegramIcon } from '@/components/TelegramIcon'
import { Check } from '@/components/Icons'

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
//
// Redesenho (história fix/ajustes-icone-telegram-e-momentos, T5) — mockup
// fornecido pelo navigator: card maior, logo grande com halo/glow atrás,
// checkbox customizado (quadrado azul + Check branco, em vez do checkbox
// nativo pequeno — o <input type="checkbox"> nativo continua por trás,
// só visualmente reestilizado, pra manter role="checkbox"/foco/teclado
// intactos), botão "Aplicar" com ícone. `savedActive` guarda o último valor
// CONFIRMADO (do fetch inicial, ou reatribuído após um PUT bem-sucedido) —
// "Aplicar" só fica habilitado quando `activeStaged` diverge dele.
export default function TelegramExtensionCard() {
  const [ext, setExt] = useState<Extension | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [activeStaged, setActiveStaged] = useState(false)
  const [savedActive, setSavedActive] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/settings/extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((list: Extension[]) => {
        const found = list?.find((e) => e.id === 'telegram') ?? null
        setExt(found)
        setActiveStaged(found?.active ?? false)
        setSavedActive(found?.active ?? false)
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
      .then((r) => {
        if (r.ok) setSavedActive(activeStaged)
      })
      .catch(() => {})
      .finally(() => setSaving(false))
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Carregando...</p>
  if (!ext) return <p className="text-sm text-muted-foreground">Extensão não encontrada.</p>

  return (
    <div
      id="telegram-extension-card"
      className="bg-surface border border-border rounded-xl p-6 max-w-md"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 -m-2 rounded-full bg-primary/20 blur-lg" />
          <TelegramIcon className="relative h-16 w-16" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{ext.name}</p>
          <p className="text-sm text-muted-foreground mt-1">{ext.description}</p>
        </div>
      </div>
      {ext.available ? (
        <>
          <div className="border-t border-border my-4" />
          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <span className="relative shrink-0 mt-0.5">
              <input
                type="checkbox"
                id="telegram-active"
                checked={activeStaged}
                onChange={(e) => setActiveStaged(e.target.checked)}
                className="peer sr-only"
              />
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border bg-surface-2 peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 transition-colors">
                {activeStaged && <Check className="h-4 w-4 text-primary-foreground" />}
              </span>
            </span>
            <span>
              <span className="block text-base font-medium text-foreground">Ativado</span>
              <span className="block text-sm text-muted-foreground">
                Você receberá notificações e avisos no Telegram.
              </span>
            </span>
          </label>
          <div className="flex justify-end">
            <Button
              id="telegram-apply"
              onClick={handleApply}
              disabled={saving || activeStaged === savedActive}
            >
              <Check className="h-4 w-4" />
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
