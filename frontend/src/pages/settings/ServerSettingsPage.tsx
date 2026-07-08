import Layout from '../../components/Layout'
import PageHeader from '../../components/PageHeader'
import SettingsSection from '../../components/SettingsSection'
import { useSettings } from '../../hooks/useSettings'
import { getRole } from '../../auth'

export default function ServerSettingsPage() {
  const isAdmin = getRole() === 'admin'
  const { settings } = useSettings()
  const s = settings?.server

  return (
    <Layout id="server-settings-page" footerId="server-settings-footer" contentClassName="p-6">
      <div id="server-settings-content" className="page-content space-y-4">
        <PageHeader title="Servidor" subtitle="Porta, JWT e configurações de rede." />
        {!isAdmin ? (
          <p className="text-muted-foreground text-sm">Acesso restrito.</p>
        ) : !s ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : (
          <SettingsSection
            title="Servidor web"
            fields={[
              { label: 'Porta HTTP', value: s.port },
              { label: 'Usuário', value: s.username },
            ]}
          />
        )}
      </div>
    </Layout>
  )
}
