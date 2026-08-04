import { useEffect, useRef, useState } from 'react'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import { authHeaders } from '../../auth'
import { Button } from '@/components/ui/button'

interface AnalysisConfig {
  service_url: string
  model: string
  has_custom_model?: boolean
}

interface ModelInfo {
  name: string
  group: string
  inference: boolean
  finetune: boolean
}

function ReanalyzePanel({ ftActive }: { ftActive: boolean }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  async function handleReanalyze() {
    setBusy(true)
    setDone(false)
    setErr('')
    try {
      const r = await fetch('/api/settings/analysis/reanalyze', {
        method: 'POST',
        headers: authHeaders(),
      })
      if (r.ok) {
        setDone(true)
        setTimeout(() => setDone(false), 3000)
      } else setErr('Erro ao solicitar re-análise')
    } catch {
      setErr('Erro ao solicitar re-análise')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-2 rounded-lg border border-border p-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">Re-analisar tudo</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Limpa as detecções existentes e re-envia todas as gravações ao serviço YOLO com o modelo
          atual.
        </p>
        {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
        {done && (
          <p className="text-xs text-green-400 mt-1">
            Re-análise agendada — será processada na próxima limpeza do storage.
          </p>
        )}
        {ftActive && (
          <p className="text-xs text-amber-400 mt-1">
            Fine-tuning em andamento — aguarde para reanalisar (evita disputar a GPU com o treino).
          </p>
        )}
      </div>
      <Button
        id="analysis-reanalyze"
        type="button"
        variant="secondary"
        className="shrink-0"
        onClick={handleReanalyze}
        disabled={busy || ftActive}
      >
        {busy ? 'Aguarde...' : 'Re-analisar tudo'}
      </Button>
    </div>
  )
}

export default function AnalysisSettingsPage() {
  const [cfg, setCfg] = useState<AnalysisConfig>({
    service_url: '',
    model: 'yolov8n',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [serviceModels, setServiceModels] = useState<ModelInfo[] | null>(null)
  const [serviceOffline, setServiceOffline] = useState(false)
  const [serviceDevice, setServiceDevice] = useState<string | null>(null)
  const [serviceVramGb, setServiceVramGb] = useState<number | null>(null)

  const activeBase = cfg.model.startsWith('custom+')
    ? cfg.model.slice('custom+'.length)
    : cfg.model === 'custom'
      ? null
      : cfg.model
  const activeModelInfo =
    activeBase && serviceModels ? (serviceModels.find((m) => m.name === activeBase) ?? null) : null
  const modelNoFinetune =
    serviceModels !== null &&
    !serviceOffline &&
    activeModelInfo !== null &&
    !activeModelInfo.finetune
  const [annCount, setAnnCount] = useState<number | null>(null)
  const [labelCount, setLabelCount] = useState<number | null>(null)
  const [epochs, setEpochs] = useState(20)
  const [ftJobID, setFtJobID] = useState<string | null>(() => localStorage.getItem('ft_job_id'))
  const [ftStatus, setFtStatus] = useState<{
    status: string
    epoch: number
    total_epochs: number
    error: string
  } | null>(null)
  const [ftError, setFtError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ftActive = ftStatus?.status === 'running' || ftStatus?.status === 'pending'

  function fetchModels() {
    fetch('/api/settings/analysis/models', { headers: authHeaders() })
      .then((r) => {
        if (!r.ok) throw new Error('offline')
        return r.json()
      })
      .then((d) => {
        setServiceModels(d.models)
        setServiceDevice(d.device ?? null)
        setServiceVramGb(typeof d.vram_gb === 'number' ? d.vram_gb : null)
        setServiceOffline(false)
      })
      .catch(() => {
        setServiceModels(null)
        setServiceDevice(null)
        setServiceVramGb(null)
        setServiceOffline(true)
      })
  }

  function refreshCounts() {
    fetch('/api/settings/analysis/annotation-count', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setAnnCount(d.count ?? 0)
          setLabelCount(d.label_count ?? 0)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetch('/api/settings/analysis', { headers: authHeaders() })
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => setError('Falha ao carregar configurações'))
    refreshCounts()
    fetchModels()
  }, [])

  useEffect(() => {
    if (!ftJobID) return
    // Fetch once immediately to restore state when returning to the page
    fetch(`/api/settings/analysis/finetune/status/${ftJobID}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s) setFtStatus(s)
      })
      .catch(() => {})
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/settings/analysis/finetune/status/${ftJobID}`, {
          headers: authHeaders(),
        })
        if (!r.ok) return
        const s = await r.json()
        setFtStatus(s)
        if (s.status === 'done' || s.status === 'error') {
          clearInterval(pollRef.current!)
          pollRef.current = null
          localStorage.removeItem('ft_job_id')
          if (s.status === 'error') setFtError(s.error || 'Erro no treino')
          if (s.status === 'done') {
            fetch('/api/settings/analysis', { headers: authHeaders() })
              .then((r) => r.json())
              .then((data) => setCfg(data))
              .catch(() => {})
          }
        }
      } catch {
        /* ignore poll errors */
      }
    }, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [ftJobID])

  async function handleStartFinetune() {
    setFtError('')
    setFtStatus(null)
    setFtJobID(null)
    localStorage.removeItem('ft_job_id')
    const res = await fetch('/api/settings/analysis/finetune', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ epochs }),
    })
    if (!res.ok) {
      const msg = await res.text()
      setFtError(msg || 'Erro ao iniciar treino')
      return
    }
    const { job_id } = await res.json()
    localStorage.setItem('ft_job_id', job_id)
    setFtJobID(job_id)
    setFtStatus({ status: 'pending', epoch: 0, total_epochs: 20, error: '' })
  }

  async function handleCancelFinetune() {
    if (!ftJobID) return
    await fetch(`/api/settings/analysis/finetune/${ftJobID}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    localStorage.removeItem('ft_job_id')
    setFtJobID(null)
    setFtStatus(null)
    setFtError('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/settings/analysis', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        fetchModels()
      } else {
        setError('Erro ao salvar')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout id="analysis-settings-page" footerId="analysis-settings-footer">
      <div className="space-y-6">
        <PageHeader
          title="Análise de vídeo"
          subtitle="Serviço YOLO usado por detectores de objetos, fine-tuning e treino de state classification."
        />

        <form
          onSubmit={handleSave}
          className="bg-surface-2 rounded-lg border border-border divide-y divide-border"
        >
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  URL do serviço
                </label>
                <input
                  type="url"
                  className="w-full bg-surface-2 text-foreground text-sm rounded px-3 py-2 border border-border focus:outline-none focus:border-ring"
                  placeholder="http://yolo:8001"
                  value={cfg.service_url}
                  onChange={(e) => setCfg((c) => ({ ...c, service_url: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Endereço do container YOLO (ex: <code>http://yolo:8001</code>)
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Modelo
                </label>
                {serviceOffline ? (
                  <div className="w-full bg-surface-2 text-amber-400 text-sm rounded px-3 py-2 border border-amber-600">
                    Serviço YOLO offline — configure a URL e verifique se o container está rodando
                  </div>
                ) : serviceModels === null ? (
                  <div className="w-full bg-surface-2 text-muted-foreground text-sm rounded px-3 py-2 border border-border">
                    Carregando modelos...
                  </div>
                ) : (
                  <>
                    <select
                      className="w-full bg-surface-2 text-foreground text-sm rounded px-3 py-2 border border-border focus:outline-none focus:border-ring"
                      value={cfg.model}
                      onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
                    >
                      {cfg.has_custom_model &&
                        (() => {
                          const base = cfg.model.startsWith('custom+')
                            ? cfg.model.slice('custom+'.length)
                            : cfg.model === 'custom'
                              ? 'yolov8n'
                              : cfg.model
                          const combinedValue = `custom+${base}`
                          return (
                            <optgroup label="Custom">
                              <option value="custom">custom ✓ (treinado)</option>
                              <option value={combinedValue}>custom + {base}</option>
                            </optgroup>
                          )
                        })()}
                      {Array.from(
                        new Set(
                          serviceModels
                            .filter((m) => m.inference && m.name !== 'custom')
                            .map((m) => m.group),
                        ),
                      ).map((group) => (
                        <optgroup key={group} label={group}>
                          {serviceModels
                            .filter((m) => m.group === group && m.inference && m.name !== 'custom')
                            .map((m) => (
                              <option key={m.name} value={m.name}>
                                {m.name}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">
                      n = mais rápido · x = mais preciso
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 flex items-center justify-between">
            {error && <p className="text-sm text-red-400">{error}</p>}
            {saved && <p className="text-sm text-green-400">Salvo</p>}
            {!error && !saved && <span />}
            <Button id="analysis-save" type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>

        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <h4 className="text-sm font-medium text-foreground mb-2">Como usar</h4>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>
              Suba o serviço YOLO:{' '}
              <code className="bg-surface-2 px-1 rounded">docker compose --profile yolo up -d</code>
            </li>
            <li>
              Configure a URL acima (padrão:{' '}
              <code className="bg-surface-2 px-1 rounded">http://yolo:8001</code>) — usada por
              fine-tuning e treino de state classification
            </li>
            <li>
              Cadastre um detector em Configurações → Detectores de objetos apontando pro serviço
            </li>
            <li>
              Escolha esse detector por câmera em Configurações → Câmeras → Análise — só a partir
              daí as gravações concluídas passam a ser analisadas automaticamente
            </li>
          </ol>
        </div>

        <ReanalyzePanel ftActive={ftActive} />

        <div className="bg-surface-2 rounded-lg border border-border divide-y divide-border">
          <div className="p-4">
            <h4 className="text-sm font-semibold text-foreground mb-1">Fine-tuning</h4>
            <p className="text-xs text-muted-foreground">
              Treina um modelo personalizado usando os snapshots que você anotou nos eventos de
              movimento. O modelo gerado (
              <code className="bg-surface-2 px-1 rounded">custom.pt</code>) fica disponível no
              seletor acima.
            </p>
          </div>

          {modelNoFinetune && serviceDevice === 'cpu' && (
            <div className="px-4 py-2 bg-amber-900/40 border-b border-amber-700 text-amber-300 text-xs">
              O serviço de análise está rodando sem GPU (CPU) — fine-tuning não é viável em nenhum
              modelo nesse modo.
            </div>
          )}
          {modelNoFinetune && serviceDevice !== 'cpu' && (
            <div className="px-4 py-2 bg-amber-900/40 border-b border-amber-700 text-amber-300 text-xs">
              O modelo <strong>{activeBase}</strong> não suporta fine-tuning na GPU disponível
              {serviceVramGb !== null ? ` (${serviceVramGb}GB)` : ''}. Selecione um modelo menor
              (ex: yolov8n, yolo11n).
            </div>
          )}
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm text-foreground">
                  {annCount === null ? '…' : annCount} bounding box{annCount !== 1 ? 'es' : ''}
                  {' · '}
                  {labelCount === null ? '…' : labelCount} evento{labelCount !== 1 ? 's' : ''}{' '}
                  rotulado{labelCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  Bounding boxes + labels de texto são usados no treino
                </p>
              </div>
              <Button
                type="button"
                disabled={(!annCount && !labelCount) || ftActive || modelNoFinetune}
                onClick={handleStartFinetune}
                className="bg-violet-600 hover:bg-violet-500 text-white shrink-0"
              >
                Treinar agora
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground shrink-0">Épocas</label>
              <input
                type="number"
                min={1}
                max={200}
                value={epochs}
                onChange={(e) =>
                  setEpochs(Math.min(200, Math.max(1, Number(e.target.value) || 20)))
                }
                className="w-20 bg-surface-2 text-foreground text-sm rounded px-2 py-1 border border-border focus:outline-none focus:border-ring"
              />
              <p className="text-xs text-muted-foreground">
                Mais épocas = aprende melhor, mas demora mais e pode decorar exemplos (overfitting)
                com poucos dados. Para &lt; 200 exemplos, 20–50 épocas costuma ser o ideal.
              </p>
            </div>
          </div>

          {ftStatus && (
            <div className="p-4 space-y-2">
              {(ftStatus.status === 'running' || ftStatus.status === 'pending') && (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {ftStatus.status === 'pending'
                        ? 'Iniciando…'
                        : `Época ${ftStatus.epoch} / ${ftStatus.total_epochs}`}
                    </span>
                    <div className="flex items-center gap-3">
                      <span>
                        {ftStatus.status === 'running'
                          ? `${Math.round((ftStatus.epoch / ftStatus.total_epochs) * 100)}%`
                          : ''}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancelFinetune}
                        className="h-auto px-2 py-0.5 text-xs hover:border-red-700/50 hover:bg-red-900/60 hover:text-red-300"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                  <div className="w-full bg-surface-2 rounded-full h-2">
                    <div
                      className="bg-violet-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.round((ftStatus.epoch / ftStatus.total_epochs) * 100)}%`,
                      }}
                    />
                  </div>
                </>
              )}
              {ftStatus.status === 'done' && (
                <p className="text-sm text-green-400">
                  Treino concluído. Modelo salvo como{' '}
                  <code className="bg-surface-2 px-1 rounded">custom</code>.
                </p>
              )}
              {ftStatus.status === 'error' && (
                <p className="text-sm text-red-400">
                  {ftError || ftStatus.error || 'Erro no treino'}
                </p>
              )}
            </div>
          )}

          {ftError && !ftStatus && (
            <div className="p-4">
              <p className="text-sm text-red-400">{ftError}</p>
            </div>
          )}
        </div>
      </div>
    </SettingsLayout>
  )
}
