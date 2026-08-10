import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import { authHeaders } from '../../auth'

interface ExtensionOption {
  id: string
  name: string
}

// PreferencesExtensionsLandingPage — rota "/settings/preferences/extensions"
// (sem id): Extensões passou a ser navegada por item (uma página própria
// por extensão, ver TelegramExtensionPage/S3ExtensionConfigPage), então esta
// página só existe pra resolver QUAL extensão abrir antes de entrar de fato
// — mesmo padrão de HistoryLandingPage/StatesLandingPage (nunca mostra um
// picker, navega direto pra a 1ª extensão assim que a lista carrega).
// `replace: true` pra não empilhar "/settings/preferences/extensions" no histórico.
export default function PreferencesExtensionsLandingPage() {
  const navigate = useNavigate()
  const [extensions, setExtensions] = useState<ExtensionOption[] | null>(null)

  useEffect(() => {
    fetch('/api/settings/extensions', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ExtensionOption[]) => setExtensions(list))
      .catch(() => setExtensions([]))
  }, [])

  useEffect(() => {
    if (extensions && extensions.length > 0)
      navigate(`/settings/preferences/extensions/${extensions[0].id}`, { replace: true })
  }, [extensions, navigate])

  return (
    <SettingsLayout
      id="preferences-extensions-landing-page"
      footerId="preferences-extensions-landing-footer"
    >
      <PageHeader title="Preferências" subtitle="Extensões disponíveis para esta instância." />
      {extensions === null ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : extensions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma extensão disponível.</p>
      ) : null}
    </SettingsLayout>
  )
}
