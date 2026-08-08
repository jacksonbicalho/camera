import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import MotionScoreChart from '../../components/MotionScoreChart'
import { ChevronDown } from '../../components/Icons'
import { useSettings } from '../../hooks/useSettings'
import { useStats } from '../../hooks/useStats'
import { formatBytes, formatDuration } from '../statsUtils'
import { authHeaders, getRole, onUnauthorized } from '../../auth'

interface Field {
  label: string
  value: string
}

interface CameraInfo {
  id: string
  name: string
  motion_threshold: number
}

interface CameraStatsData {
  total_bytes: number
  total_chunks: number
  total_seconds: number
  total_motion_events: number
}

// Mesmo estilo de card que StatsPage usava antes de ser removida (bg-surface/
// border/rounded-xl, título text-xs uppercase text-faint, grid de label/valor
// sem divisórias — história reorganizar-sidebar-governanca) — não extraído
// pra components/ porque só esta página usa esse padrão hoje.
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

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${online ? 'bg-green-500' : 'bg-faint'}`}
    />
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <ChevronDown
      className={`w-4 h-4 text-faint transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
    />
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
// uma métrica de uso das câmeras. Os KPIs (Gravações/Horas gravadas/
// Câmeras) e a lista expansível de câmeras com `MotionScoreChart` também
// migraram pra cá, fechando o ciclo — StatsPage.tsx deixou de existir
// (história reorganizar-sidebar-governanca): esses eram os únicos dados
// que ainda restavam lá, o resto (Sistema, Uso de disco) já tinha migrado
// em histórias anteriores.
export default function ServerSettingsPage() {
  const isAdmin = getRole() === 'admin'
  const { settings } = useSettings()
  const { stats } = useStats()
  const cpuPct = stats?.cpu_percent ?? -1
  const sysMemUsed = (stats?.sys_mem_total_bytes ?? 0) - (stats?.sys_mem_free_bytes ?? 0)

  const [cameras, setCameras] = useState<CameraInfo[]>([])
  const [expandedCams, setExpandedCams] = useState<Set<string>>(new Set())
  const [cameraStats, setCameraStats] = useState<Record<string, CameraStatsData | null>>({})

  useEffect(() => {
    fetch('/api/cameras', { headers: authHeaders() })
      .then((res) => {
        if (res.status === 401) {
          onUnauthorized()
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (Array.isArray(data)) setCameras(data)
      })
      .catch(() => {})
  }, [])

  function toggleCam(id: string) {
    setExpandedCams((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    // Busca as estatísticas só na primeira expansão (lazy), migrado de
    // CameraDetailSettingsPage — a página de detalhe da câmera não mostra
    // mais essa sessão.
    if (!(id in cameraStats)) {
      fetch(`/api/cameras/${id}/stats`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setCameraStats((prev) => ({ ...prev, [id]: data })))
        .catch(() => {})
    }
  }

  const cameraHealthMap = Object.fromEntries((stats?.cameras ?? []).map((c) => [c.id, c]))

  return (
    <SettingsLayout id="server-settings-page" footerId="server-settings-footer">
      <PageHeader
        title="Servidor"
        subtitle="Rede, fuso horário, configurações de log e estatísticas de uso."
      />
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
                {stats.cpu_temp_c >= 0 && (
                  <div>
                    <p className="text-xs text-faint mb-1">Temperatura</p>
                    <p className="text-sm font-mono text-foreground">
                      {stats.cpu_temp_c.toFixed(1)}°C
                    </p>
                  </div>
                )}
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

          {stats && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-surface border border-border rounded-xl p-5">
                  <p className="text-xs text-faint uppercase tracking-wider mb-3">Gravações</p>
                  <p className="text-3xl font-bold text-foreground">
                    {stats.recordings_count.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatBytes(stats.recordings_bytes)}
                  </p>
                </div>
                <div className="bg-surface border border-border rounded-xl p-5">
                  <p className="text-xs text-faint uppercase tracking-wider mb-3">Horas gravadas</p>
                  <p className="text-3xl font-bold text-foreground">
                    {formatDuration(stats.recordings_duration_seconds)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">de vídeo em disco</p>
                </div>
                <div className="bg-surface border border-border rounded-xl p-5">
                  <p className="text-xs text-faint uppercase tracking-wider mb-3">Câmeras</p>
                  <p className="text-3xl font-bold text-foreground">{stats.camera_count}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {stats.connected_clients} cliente{stats.connected_clients !== 1 ? 's' : ''}{' '}
                    conectado{stats.connected_clients !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {cameras.length > 0 && (
                <div className="bg-surface border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <p className="text-xs text-faint uppercase tracking-wider font-medium">
                      Câmeras
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {cameras.map((cam) => {
                      const health = cameraHealthMap[cam.id]
                      const lastRec = health?.last_recording_at
                        ? new Date(health.last_recording_at)
                        : null
                      const isOpen = expandedCams.has(cam.id)
                      const hasMotion = health?.motion_enabled ?? false

                      return (
                        <div key={cam.id}>
                          <button
                            onClick={() => toggleCam(cam.id)}
                            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2/50 transition-colors"
                          >
                            <StatusDot online={health?.online ?? false} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {cam.name || cam.id}
                              </p>
                              <p className="text-xs text-faint font-mono">{cam.id}</p>
                            </div>
                            <div className="text-right shrink-0 mr-2">
                              {lastRec ? (
                                <p className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(lastRec, { addSuffix: true, locale: ptBR })}
                                </p>
                              ) : (
                                <p className="text-xs text-faint">sem gravações</p>
                              )}
                              {hasMotion && <p className="text-xs text-blue-500">detecção ativa</p>}
                            </div>
                            <ChevronIcon open={isOpen} />
                          </button>

                          {isOpen && (
                            <div className="px-5 pb-5">
                              {hasMotion ? (
                                <MotionScoreChart
                                  key={cam.id}
                                  cameraId={cam.id}
                                  threshold={cam.motion_threshold}
                                />
                              ) : (
                                <p className="text-xs text-faint py-3">
                                  Detecção de movimento desativada para esta câmera.
                                </p>
                              )}
                              <div
                                id={`camera-stats-${cam.id}`}
                                className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4"
                              >
                                {(() => {
                                  const s = cameraStats[cam.id]
                                  const fields: Field[] = s
                                    ? [
                                        {
                                          label: 'Total gravado',
                                          value: formatDuration(s.total_seconds),
                                        },
                                        { label: 'Segmentos MP4', value: String(s.total_chunks) },
                                        {
                                          label: 'Espaço em disco',
                                          value: formatBytes(s.total_bytes),
                                        },
                                        {
                                          label: 'Eventos de movimento',
                                          value: String(s.total_motion_events),
                                        },
                                      ]
                                    : [{ label: 'Estatísticas', value: 'Carregando...' }]
                                  return fields.map(({ label, value }) => (
                                    <div key={label}>
                                      <p className="text-xs text-faint mb-1">{label}</p>
                                      <p className="text-sm font-mono text-foreground">{value}</p>
                                    </div>
                                  ))
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SettingsLayout>
  )
}
