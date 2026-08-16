import { useEffect, useState } from 'react'
import { authHeaders } from '../../auth'
import { Button } from '@/components/ui/button'
import { TelegramIcon } from '@/components/TelegramIcon'
import { Check } from '@/components/Icons'
import ExtensionCard from '@/components/ExtensionCard'
import ExtensionActiveToggle from '@/components/ExtensionActiveToggle'

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
// botão "Aplicar" com ícone. `savedActive` guarda o último valor CONFIRMADO
// (do fetch inicial, ou reatribuído após um PUT bem-sucedido) — "Aplicar"
// só fica habilitado quando `activeStaged` diverge dele. Chrome visual
// (card/ícone+halo/nome/descrição) e o controle "Ativado" migraram pra
// ExtensionCard/ExtensionActiveToggle na história
// fix/extension-card-compartilhado-e-s3-redesign (T1), compartilhados com
// S3ExtensionCard.
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
    <ExtensionCard
      id="telegram-extension-card"
      icon={<TelegramIcon className="relative h-16 w-16" />}
      name={ext.name}
      description={ext.description}
      available={ext.available}
    >
      <ExtensionActiveToggle
        id="telegram-active"
        checked={activeStaged}
        onChange={setActiveStaged}
        savedActive={savedActive}
        description="Você receberá notificações e avisos no Telegram."
      />
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
    </ExtensionCard>
  )
}
