import { useEffect, useState } from 'react'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import PreferencesTabs from '../../components/PreferencesTabs'
import { authHeaders } from '../../auth'

interface ExtensionsConfig {
  telegram_enabled: boolean
  telegram_available: boolean
}

export default function PreferencesExtensionsPage() {
  const [config, setConfig] = useState<ExtensionsConfig | null>(null)

  useEffect(() => {
    fetch('/api/settings/extensions', { headers: authHeaders() })
      .then((res) => res.json())
      .then((data: ExtensionsConfig) => setConfig(data))
      .catch(() => {})
  }, [])

  function toggleTelegram(enabled: boolean) {
    if (!config) return
    setConfig({ ...config, telegram_enabled: enabled })
    fetch('/api/settings/extensions', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_enabled: enabled }),
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
        {config?.telegram_available && (
          <div className="bg-surface border border-border rounded-lg p-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="extension-telegram-enabled"
                checked={config.telegram_enabled}
                onChange={(e) => toggleTelegram(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">Telegram</span>
            </label>
          </div>
        )}
        {config && !config.telegram_available && (
          <p className="text-xs text-muted-foreground">Nenhuma extensão configurada.</p>
        )}
      </div>
    </SettingsLayout>
  )
}
