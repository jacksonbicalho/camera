import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import ServerSettingsTabs from '../../components/ServerSettingsTabs'
import { useSettings } from '../../hooks/useSettings'
import { getRole } from '../../auth'

interface Field {
  label: string
  value: string
}

// Mesmo estilo de card usado em StatsPage (bg-surface/border/rounded-xl,
// título text-xs uppercase text-faint, grid de label/valor sem divisórias)
// — não extraído pra components/ porque só StatsPage e esta página usam esse
// padrão, e StatsPage também monta os cards inline.
function InfoCard({ title, fields }: { title: string; fields: Field[] }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <p className="text-xs text-faint uppercase tracking-wider mb-4">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
        {fields.map(({ label, value }) => (
          <div key={label}>
            <p className="text-xs text-faint mb-1">{label}</p>
            <p className="text-sm font-mono text-foreground break-all">{value || '—'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SystemSettingsPage() {
  const isAdmin = getRole() === 'admin'
  const { settings } = useSettings()

  return (
    <SettingsLayout id="system-settings-page" footerId="system-settings-footer">
      <PageHeader title="Sistema" subtitle="Fuso horário e configurações de log." />
      <ServerSettingsTabs active="system" />
      {!isAdmin ? (
        <p className="text-faint text-sm">Acesso restrito.</p>
      ) : !settings ? (
        <p className="text-faint text-sm">Carregando...</p>
      ) : (
        <div className="space-y-4">
          <InfoCard
            title="Servidor web"
            fields={[
              { label: 'Porta HTTP', value: String(settings.server.port) },
              { label: 'Usuário', value: settings.server.username || '—' },
            ]}
          />
          <InfoCard
            title="Geral"
            fields={[
              { label: 'Fuso horário', value: settings.timezone || '—' },
              { label: 'Modo debug', value: settings.debug ? 'ativado' : 'desativado' },
            ]}
          />
          <InfoCard
            title="Logs"
            fields={
              settings.log.output === 'file'
                ? [
                    { label: 'Destino', value: settings.log.output },
                    { label: 'Diretório', value: settings.log.path || '—' },
                    { label: 'Rotaciona em', value: `${settings.log.max_size_mb} MB` },
                    {
                      label: 'Retenção',
                      value:
                        settings.log.max_age_days > 0
                          ? `${settings.log.max_age_days} dias`
                          : 'ilimitada',
                    },
                    {
                      label: 'Máx. de arquivos',
                      value:
                        settings.log.max_backups > 0
                          ? String(settings.log.max_backups)
                          : 'ilimitado',
                    },
                    { label: 'Compressão', value: settings.log.compress ? 'gzip' : 'desativada' },
                  ]
                : [
                    { label: 'Destino', value: settings.log.output || 'stdout' },
                    { label: 'Diretório', value: settings.log.path || '—' },
                  ]
            }
          />
          <InfoCard
            title="Caminhos"
            fields={[
              { label: 'Segmentos HLS', value: settings.server.segments_path || '—' },
              { label: 'Gravações', value: settings.server.recordings_path || '—' },
            ]}
          />
          <InfoCard
            title="Padrões de câmera"
            fields={[
              { label: 'Duração do chunk', value: settings.defaults.chunk_duration },
              { label: 'Intervalo de reconexão', value: settings.defaults.reconnect_interval },
            ]}
          />
        </div>
      )}
    </SettingsLayout>
  )
}
