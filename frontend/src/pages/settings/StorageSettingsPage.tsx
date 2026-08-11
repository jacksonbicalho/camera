import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import PreferencesLayout from '../../components/PreferencesLayout'
import SettingsSection from '../../components/SettingsSection'
import { useSettings } from '../../hooks/useSettings'
import { useStats } from '../../hooks/useStats'
import { formatBytes, formatDuration } from '../statsUtils'
import { authHeaders, getRole } from '../../auth'
import { Button } from '@/components/ui/button'

// ── helpers ──────────────────────────────────────────────────────────────────

function minutesToParts(m: number): { value: number; unit: 'min' | 'h' | 'd' } {
  if (m === 0) return { value: 0, unit: 'h' }
  if (m % (60 * 24) === 0) return { value: m / (60 * 24), unit: 'd' }
  if (m % 60 === 0) return { value: m / 60, unit: 'h' }
  return { value: m, unit: 'min' }
}

function partsToMinutes(value: number, unit: 'min' | 'h' | 'd'): number {
  if (unit === 'd') return value * 60 * 24
  if (unit === 'h') return value * 60
  return value
}

function formatMinutes(m: number): string {
  const { value, unit } = minutesToParts(m)
  return `${value} ${unit}`
}

// ── sub-components ─────────────────────────────────────────────────────────

interface DurationInputProps {
  value: number
  unit: 'min' | 'h' | 'd'
  onValueChange: (v: number) => void
  onUnitChange: (u: 'min' | 'h' | 'd') => void
}

function DurationInput({ value, unit, onValueChange, onUnitChange }: DurationInputProps) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        className="w-16 bg-surface-2 text-foreground text-sm rounded px-2 py-1 border border-border focus:outline-none focus:border-ring"
        value={value}
        onChange={(e) => onValueChange(Number(e.target.value))}
      />
      <select
        className="bg-surface-2 text-foreground text-sm rounded px-2 py-1 border border-border"
        value={unit}
        onChange={(e) => onUnitChange(e.target.value as 'min' | 'h' | 'd')}
      >
        <option value="min">min</option>
        <option value="h">h</option>
        <option value="d">d</option>
      </select>
    </div>
  )
}

// ── types ─────────────────────────────────────────────────────────────────────

// RetentionExtension é o destino S3 (0 ou 1 linha — singleton, história
// feat/extensoes-generalizadas-s3-extensao). Cadastrar/editar esse destino
// não é mais feito aqui: vive no card da extensão S3 em Preferências >
// Extensões (`S3ExtensionCard`). Esta página só CONSOME o estado pra popular
// o select "Ao expirar".
interface RetentionExtension {
  id: string
  name: string
}

interface RetentionConfig {
  category: string
  action: string
  retention_extension_id: string
}

interface StorageOverrides {
  withMotionValue?: number
  withMotionUnit?: 'min' | 'h' | 'd'
  withoutMotionValue?: number
  withoutMotionUnit?: 'min' | 'h' | 'd'
  intervalValue?: number
  intervalUnit?: 'min' | 'h' | 'd'
  maxSizeGB?: number
  warnPercent?: number
  stateHistoryValue?: number
  stateHistoryUnit?: 'min' | 'h' | 'd'
}

// ── component ────────────────────────────────────────────────────────────────

export default function StorageSettingsPage() {
  const isAdmin = getRole() === 'admin'
  const location = useLocation()
  const navigate = useNavigate()
  // Edição tem URL própria (/settings/preferences/storage/edit) — mesmo
  // padrão de /settings/cameras/edit/:id e /settings/users/edit/:id:
  // `editing` é DERIVADO da rota, nunca de useState/location.state, pra
  // sobreviver a reload/deep-link.
  const editing = location.pathname === '/settings/preferences/storage/edit'
  const { settings, reload } = useSettings()
  const s = settings?.storage
  const { stats } = useStats()
  const hasLimit = (stats?.max_size_bytes ?? 0) > 0
  const limitRef = hasLimit ? stats!.max_size_bytes : (stats?.disk_total_bytes ?? 0)
  const usedPercent =
    limitRef > 0 ? Math.min(100, Math.round((stats!.recordings_bytes / limitRef) * 100)) : 0
  const warnThreshold = hasLimit && stats ? stats.warn_percent : 0
  const isWarning = warnThreshold > 0 && usedPercent >= warnThreshold
  const isOver = hasLimit && stats ? stats.recordings_bytes >= stats.max_size_bytes : false
  const barColor = isOver
    ? 'bg-gradient-to-r from-red-700 to-red-500'
    : isWarning
      ? 'bg-gradient-to-r from-yellow-600 to-yellow-400'
      : 'bg-gradient-to-r from-blue-700 to-blue-400'

  const [retentionExtensions, setRetentionExtensions] = useState<RetentionExtension[]>([])
  const [retention, setRetention] = useState<RetentionConfig[]>([])
  // Local user edits overlay the server-provided values.
  const [overrides, setOverrides] = useState<StorageOverrides>({})
  const [storageSaving, setStorageSaving] = useState(false)
  const [storageSaved, setStorageSaved] = useState(false)

  const loadRetentionExtensions = () =>
    fetch('/api/retention-extensions', { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setRetentionExtensions(d ?? []))
      .catch(() => {})

  const loadRetention = () =>
    fetch('/api/retention', { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setRetention(d ?? []))
      .catch(() => {})

  useEffect(() => {
    if (!isAdmin) return
    loadRetentionExtensions()
    loadRetention()
  }, [isAdmin])

  // Derive current form values: server values merged with local overrides.
  const form = s
    ? (() => {
        const wm = minutesToParts(s.with_motion_minutes)
        const wom = minutesToParts(s.without_motion_minutes)
        const iv = minutesToParts(s.interval_minutes === 0 ? 60 : s.interval_minutes)
        const sh = minutesToParts(s.state_history_minutes)
        return {
          withMotionValue: overrides.withMotionValue ?? wm.value,
          withMotionUnit: overrides.withMotionUnit ?? wm.unit,
          withoutMotionValue: overrides.withoutMotionValue ?? wom.value,
          withoutMotionUnit: overrides.withoutMotionUnit ?? wom.unit,
          intervalValue: overrides.intervalValue ?? iv.value,
          intervalUnit: overrides.intervalUnit ?? iv.unit,
          maxSizeGB: overrides.maxSizeGB ?? s.max_size_gb,
          warnPercent: overrides.warnPercent ?? s.warn_percent,
          stateHistoryValue: overrides.stateHistoryValue ?? sh.value,
          stateHistoryUnit: overrides.stateHistoryUnit ?? sh.unit,
        }
      })()
    : null

  const set = (patch: StorageOverrides) => {
    setOverrides((o) => ({ ...o, ...patch }))
    setStorageSaved(false)
  }

  const retentionFor = (category: string): RetentionConfig =>
    retention.find((r) => r.category === category) ?? {
      category,
      action: 'delete',
      retention_extension_id: '',
    }

  const handleRetentionChange = (category: string, action: string, extensionId: string) =>
    fetch(`/api/retention/${category}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, retention_extension_id: extensionId }),
    })
      .then(() => loadRetention())
      .catch(() => {})

  const handleStorageSave = () => {
    if (!form) return
    setStorageSaving(true)
    setStorageSaved(false)
    fetch('/api/settings/storage', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        with_motion_minutes: partsToMinutes(form.withMotionValue, form.withMotionUnit),
        without_motion_minutes: partsToMinutes(form.withoutMotionValue, form.withoutMotionUnit),
        interval_minutes: partsToMinutes(form.intervalValue, form.intervalUnit),
        max_size_gb: form.maxSizeGB,
        warn_percent: form.warnPercent,
        state_history_minutes: partsToMinutes(form.stateHistoryValue, form.stateHistoryUnit),
      }),
    })
      .then(() => {
        setOverrides({})
        reload()
        setStorageSaved(true)
        navigate('/settings/preferences/storage')
      })
      .catch(() => {})
      .finally(() => setStorageSaving(false))
  }

  const cancelStorageEdit = () => {
    setOverrides({})
    navigate('/settings/preferences/storage')
  }

  const retentionLabel = (category: string): string => {
    const rc = retentionFor(category)
    if (rc.action !== 'send_to_drive' || !rc.retention_extension_id) return 'Apagar'
    return retentionExtensions.find((ext) => ext.id === rc.retention_extension_id)?.name ?? 'Apagar'
  }

  // ── render ──────────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <SettingsLayout id="storage-settings-page" footerId="storage-settings-footer">
        <PageHeader
          title="Preferências"
          subtitle="Retenção, limpeza automática e espaço em disco."
        />
        <PreferencesLayout active="storage">
          <p className="text-muted-foreground text-sm">Acesso restrito.</p>
        </PreferencesLayout>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout id="storage-settings-page" footerId="storage-settings-footer">
      <PageHeader title="Preferências" subtitle="Retenção, limpeza automática e espaço em disco." />
      <PreferencesLayout active="storage">
        {/* Uso de disco — migrado de StatsPage (pedido do navigator: "a sessão
          Armazenamento de estatísticas deve ir para a página armazenamento"),
          via useStats/`/api/stats`, mesmo card que já existia lá. */}
        {stats && (
          <div className="bg-surface border border-border rounded-xl p-5 mb-4">
            <p className="text-xs text-faint uppercase tracking-wider mb-5">Uso de disco</p>
            <div className="grid grid-cols-1 gap-6 mb-5 sm:grid-cols-3">
              <div>
                <p className="text-xs text-faint mb-1">{hasLimit ? 'Limite' : 'Total'}</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatBytes(hasLimit ? stats.max_size_bytes : stats.disk_total_bytes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-faint mb-1">Gravações</p>
                <p
                  className={`text-2xl font-bold ${isOver ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-blue-400'}`}
                >
                  {formatBytes(stats.recordings_bytes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-faint mb-1">Disponível</p>
                <p className="text-2xl font-bold text-green-400">
                  {formatBytes(
                    hasLimit
                      ? Math.max(0, stats.max_size_bytes - stats.recordings_bytes)
                      : stats.disk_free_bytes,
                  )}
                </p>
              </div>
            </div>
            <div className="h-3 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${usedPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-faint">
                {usedPercent}%{' '}
                {hasLimit ? `do limite de ${formatBytes(stats.max_size_bytes)}` : 'do disco'}
              </p>
              {isWarning && !isOver && (
                <p className="text-xs text-yellow-500">⚠ próximo do limite</p>
              )}
              {isOver && <p className="text-xs text-red-500">⚠ limite atingido</p>}
            </div>
            {stats.forecast_seconds > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-faint">
                  Previsão de capacidade:{' '}
                  <span className="text-foreground font-medium">
                    {formatDuration(stats.forecast_seconds)} restantes
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
        {form && !editing && (
          <div className="mb-4">
            <SettingsSection
              title="Configuração"
              fields={[
                { label: 'Diretório', value: s?.path || '—' },
                {
                  label: 'Máximo',
                  value: s && s.max_size_gb > 0 ? `${s.max_size_gb} GB` : '0 = off',
                },
                { label: 'Alerta', value: s ? `${s.warn_percent}%` : '—' },
                {
                  label: 'Intervalo de verificação',
                  value: s
                    ? formatMinutes(s.interval_minutes === 0 ? 60 : s.interval_minutes)
                    : '—',
                },
                {
                  label: 'Histórico de estados (padrão)',
                  value: s
                    ? s.state_history_minutes <= 0
                      ? 'para sempre'
                      : formatMinutes(s.state_history_minutes)
                    : '—',
                },
                {
                  label: 'Com movimento',
                  value: s
                    ? `${formatMinutes(s.with_motion_minutes)} · ${retentionLabel('with_motion')}`
                    : '—',
                },
                {
                  label: 'Sem movimento',
                  value: s
                    ? `${formatMinutes(s.without_motion_minutes)} · ${retentionLabel('without_motion')}`
                    : '—',
                },
              ]}
            >
              {s && (
                <div className="px-5 py-3 flex justify-end border-t border-border">
                  <Button
                    id="storage-edit"
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/settings/preferences/storage/edit')}
                  >
                    Editar
                  </Button>
                </div>
              )}
            </SettingsSection>
          </div>
        )}
        {form && editing ? (
          <div className="space-y-2 mb-4">
            {/* Diretório + Máximo + Alerta + Intervalo */}
            <div className="bg-surface-2 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-x-8 gap-y-3 items-start">
              <div>
                <span className="block text-xs text-muted-foreground mb-1">Diretório</span>
                <span className="text-sm text-foreground break-all">{s?.path || '—'}</span>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground mb-1">Máximo (GB)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="w-20 bg-surface-2 text-foreground text-sm rounded px-2 py-1 border border-border focus:outline-none focus:border-ring"
                    value={form.maxSizeGB}
                    onChange={(e) => set({ maxSizeGB: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">0 = off</span>
                </div>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground mb-1">Alerta (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-20 bg-surface-2 text-foreground text-sm rounded px-2 py-1 border border-border focus:outline-none focus:border-ring"
                  value={form.warnPercent}
                  onChange={(e) => set({ warnPercent: Number(e.target.value) })}
                />
              </div>
              <div>
                <span className="block text-xs text-muted-foreground mb-1">
                  Intervalo de verificação
                </span>
                <DurationInput
                  value={form.intervalValue}
                  unit={form.intervalUnit}
                  onValueChange={(v) => set({ intervalValue: v })}
                  onUnitChange={(u) => set({ intervalUnit: u })}
                />
              </div>
              <div>
                <span className="block text-xs text-muted-foreground mb-1">
                  Histórico de estados (padrão)
                </span>
                <DurationInput
                  value={form.stateHistoryValue}
                  unit={form.stateHistoryUnit}
                  onValueChange={(v) => set({ stateHistoryValue: v })}
                  onUnitChange={(u) => set({ stateHistoryUnit: u })}
                />
              </div>
            </div>

            {/* Retention rows */}
            {(
              [
                {
                  label: 'Com movimento',
                  vk: 'withMotionValue',
                  uk: 'withMotionUnit',
                  cat: 'with_motion',
                },
                {
                  label: 'Sem movimento',
                  vk: 'withoutMotionValue',
                  uk: 'withoutMotionUnit',
                  cat: 'without_motion',
                },
              ] as const
            ).map(({ label, vk, uk, cat }) => {
              const rc = retentionFor(cat)
              return (
                <div
                  key={cat}
                  className="bg-surface-2 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-[auto_auto_auto] gap-x-6 gap-y-3 items-start"
                >
                  <div>
                    <span className="block text-xs text-muted-foreground mb-1">{label}</span>
                    <DurationInput
                      value={form[vk]}
                      unit={form[uk]}
                      onValueChange={(v) => set({ [vk]: v })}
                      onUnitChange={(u) => set({ [uk]: u })}
                    />
                  </div>
                  <div>
                    <span className="block text-xs text-muted-foreground mb-1">Ao expirar</span>
                    {/* "Apagar" + a extensão de retenção configurada (0 ou 1 — S3 é
                      singleton, cadastrado em Preferências > Extensões > Configurar). */}
                    <select
                      className="bg-surface-2 text-foreground text-sm rounded px-2 py-1 border border-border"
                      value={
                        rc.action === 'send_to_drive' && rc.retention_extension_id
                          ? `ext:${rc.retention_extension_id}`
                          : 'delete'
                      }
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === 'delete') handleRetentionChange(cat, 'delete', '')
                        else handleRetentionChange(cat, 'send_to_drive', v.slice('ext:'.length))
                      }}
                    >
                      <option value="delete">Apagar</option>
                      {retentionExtensions.map((ext) => (
                        <option key={ext.id} value={`ext:${ext.id}`}>
                          {ext.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}

            <div className="flex justify-end items-center gap-3 pt-1">
              {storageSaved && <span className="text-xs text-green-400">Salvo</span>}
              <Button id="storage-cancel" variant="outline" onClick={cancelStorageEdit}>
                Cancelar
              </Button>
              <Button id="storage-save" onClick={handleStorageSave} disabled={storageSaving}>
                {storageSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        ) : (
          !form && <p className="text-muted-foreground text-sm mb-4">Carregando...</p>
        )}

        {retentionExtensions.length === 0 &&
          retention.some((r) => r.action === 'send_to_drive') && (
            <p className="text-xs text-amber-400 mb-4">
              Nenhuma extensão de retenção configurada — gravações com essa ação serão ignoradas
              pelo cleaner. Configure em Preferências &gt; Extensões.
            </p>
          )}
      </PreferencesLayout>
    </SettingsLayout>
  )
}
