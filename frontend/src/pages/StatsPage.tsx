import { useEffect, useState } from 'react'
import { authHeaders, onUnauthorized } from '../auth'
import SettingsLayout from '../components/SettingsLayout'
import PageHeader from '../components/PageHeader'
import MotionScoreChart from '../components/MotionScoreChart'
import { useStats } from '../hooks/useStats'
import { formatBytes, formatDuration } from './statsUtils'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown } from '../components/Icons'

interface CameraInfo {
  id: string
  name: string
  motion_threshold: number
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${online ? 'bg-green-500' : 'bg-faint'}`}
    />
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <ChevronDown
      className={`w-4 h-4 text-faint transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
    />
  )
}

export default function StatsPage() {
  const { stats } = useStats()
  const [cameras, setCameras] = useState<CameraInfo[]>([])
  const [expandedCams, setExpandedCams] = useState<Set<string>>(new Set())

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
  }

  const cameraHealthMap = Object.fromEntries((stats?.cameras ?? []).map((c) => [c.id, c]))

  return (
    <SettingsLayout id="stats-page" footerId="stats-footer">
      <PageHeader title="Estatísticas" subtitle="Atividade e saúde das câmeras." />

      {!stats ? (
        <p className="text-faint text-sm">Carregando...</p>
      ) : (
        <div className="space-y-4">
          {/* KPIs */}
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

          {/* Câmeras */}
          {cameras.length > 0 && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <p className="text-xs text-faint uppercase tracking-wider font-medium">Câmeras</p>
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
                        <div className="text-right flex-shrink-0 mr-2">
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
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </SettingsLayout>
  )
}
