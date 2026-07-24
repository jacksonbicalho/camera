import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import { useSettings } from '../../hooks/useSettings'
import { useStats } from '../../hooks/useStats'
import { formatBytes } from '../statsUtils'
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

// ServerSettingsPage — página "Servidor" (/settings/server), sozinha na
// navegação (sem abas — a consolidação em ServerSettingsTabs foi desfeita a
// pedido do navigator: Armazenamento/Estatísticas/Relatórios/Sobre voltaram
// a ser páginas soltas, cada uma com seu próprio link no rail). Absorve o
// conteúdo que antes vivia em SystemSettingsPage (Geral/Logs/Caminhos/
// Padrões de câmera) — "Sistema" deixou de ser uma seção própria no menu,
// viu "Servidor" (pedido do navigator: "o conteúdo de sistema vai pra
// servidor"), além dos 2 campos que já eram desta página (Porta HTTP,
// Usuário). O card "Sistema" (OS/PID/CPU/memória/goroutines — saúde do
// PROCESSO do servidor, via useStats/`/api/stats`) também migrou pra cá,
// de dentro de StatsPage — pedido do navigator ("a sessão Sistema de
// estatística deve ir para servidor também"): é runtime do servidor, não
// uma métrica de uso das câmeras, que é o que StatsPage passou a focar.
export default function ServerSettingsPage() {
  const isAdmin = getRole() === 'admin'
  const { settings } = useSettings()
  const { stats } = useStats()
  const cpuPct = stats?.cpu_percent ?? -1
  const sysMemUsed = (stats?.sys_mem_total_bytes ?? 0) - (stats?.sys_mem_free_bytes ?? 0)

  return (
    <SettingsLayout id="server-settings-page" footerId="server-settings-footer">
      <PageHeader title="Servidor" subtitle="Rede, fuso horário e configurações de log." />
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
          {stats && (
            <div className="bg-surface border border-border rounded-xl p-5">
              <p className="text-xs text-faint uppercase tracking-wider mb-4">Sistema</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
                <div>
                  <p className="text-xs text-faint mb-1">OS</p>
                  <p className="text-sm font-medium text-foreground truncate">{stats.os || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-faint mb-1">PID</p>
                  <p className="text-sm font-mono text-foreground">{stats.pid}</p>
                </div>
                <div>
                  <p className="text-xs text-faint mb-1">CPU</p>
                  <p className="text-sm font-mono text-foreground">
                    {cpuPct < 0 ? '—' : `${cpuPct.toFixed(1)}%`}
                  </p>
                  {cpuPct >= 0 && <p className="text-xs text-faint">amostra 30 s</p>}
                </div>
                <div>
                  <p className="text-xs text-faint mb-1">Mem. processo</p>
                  <p className="text-sm font-mono text-foreground">
                    {stats.mem_rss_bytes > 0 ? formatBytes(stats.mem_rss_bytes) : '—'}
                  </p>
                </div>
                {stats.sys_mem_total_bytes > 0 && (
                  <div>
                    <p className="text-xs text-faint mb-1">RAM host</p>
                    <p className="text-sm font-mono text-foreground">
                      {formatBytes(sysMemUsed)} / {formatBytes(stats.sys_mem_total_bytes)}
                    </p>
                    <p className="text-xs text-faint">
                      livre: {formatBytes(stats.sys_mem_free_bytes)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-faint mb-1">Goroutines</p>
                  <p className="text-sm font-mono text-foreground">{stats.goroutines}</p>
                </div>
              </div>
            </div>
          )}
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
