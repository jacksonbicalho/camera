import { useEffect, useRef, useState } from 'react'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import { authHeaders } from '../../auth'
import { Button } from '@/components/ui/button'

interface AnalysisConfig {
  state_trainer_id: number | null
}

interface TrainerItem {
  id: number
  name: string
  type: string
  config: Record<string, string>
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
  const [cfg, setCfg] = useState<AnalysisConfig>({ state_trainer_id: null })
  const [savingStateTrainer, setSavingStateTrainer] = useState(false)
  const [error, setError] = useState('')
  const [annCount, setAnnCount] = useState<number | null>(null)
  const [labelCount, setLabelCount] = useState<number | null>(null)
  const [epochs, setEpochs] = useState(20)
  const [trainers, setTrainers] = useState<TrainerItem[]>([])
  // trainer_id persiste ao lado de ft_job_id (mesma chave localStorage,
  // ver CLAUDE.md/story) — fine-tuning não lê mais nenhum config global,
  // precisa saber qual trainer cadastrado consultar pra sobreviver a um
  // reload com job em andamento.
  const [trainerId, setTrainerId] = useState<number | null>(() => {
    const v = localStorage.getItem('ft_trainer_id')
    return v ? Number(v) : null
  })
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
    fetch('/api/settings/trainers', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTrainers(Array.isArray(d) ? d : []))
      .catch(() => setTrainers([]))
  }, [])

  useEffect(() => {
    if (!ftJobID || !trainerId) return
    const statusURL = `/api/settings/analysis/finetune/status/${ftJobID}?trainer_id=${trainerId}`
    // Fetch once immediately to restore state when returning to the page
    fetch(statusURL, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s) setFtStatus(s)
      })
      .catch(() => {})
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(statusURL, { headers: authHeaders() })
        if (!r.ok) return
        const s = await r.json()
        setFtStatus(s)
        if (s.status === 'done' || s.status === 'error') {
          clearInterval(pollRef.current!)
          pollRef.current = null
          localStorage.removeItem('ft_job_id')
          localStorage.removeItem('ft_trainer_id')
          if (s.status === 'error') setFtError(s.error || 'Erro no treino')
        }
      } catch {
        /* ignore poll errors */
      }
    }, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [ftJobID, trainerId])

  async function handleStartFinetune() {
    if (!trainerId) return
    setFtError('')
    setFtStatus(null)
    setFtJobID(null)
    localStorage.removeItem('ft_job_id')
    const res = await fetch('/api/settings/analysis/finetune', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ trainer_id: trainerId, epochs }),
    })
    if (!res.ok) {
      const msg = await res.text()
      setFtError(msg || 'Erro ao iniciar treino')
      return
    }
    const { job_id } = await res.json()
    localStorage.setItem('ft_job_id', job_id)
    localStorage.setItem('ft_trainer_id', String(trainerId))
    setFtJobID(job_id)
    setFtStatus({ status: 'pending', epoch: 0, total_epochs: 20, error: '' })
  }

  async function handleCancelFinetune() {
    if (!ftJobID || !trainerId) return
    await fetch(`/api/settings/analysis/finetune/${ftJobID}?trainer_id=${trainerId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    })
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    localStorage.removeItem('ft_job_id')
    localStorage.removeItem('ft_trainer_id')
    setFtJobID(null)
    setFtStatus(null)
    setFtError('')
  }

  // Único campo desta seção — salva sozinho ao trocar (sem botão "Salvar"
  // separado, mesmo padrão de outros seletores simples do app, ex. accent
  // color em AppearanceSettingsPage).
  async function handleStateTrainerChange(v: string) {
    const stateTrainerId = v ? Number(v) : null
    setError('')
    setSavingStateTrainer(true)
    try {
      const res = await fetch('/api/settings/analysis', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ state_trainer_id: stateTrainerId }),
      })
      if (res.ok) {
        setCfg({ state_trainer_id: stateTrainerId })
      } else {
        setError('Erro ao salvar')
      }
    } finally {
      setSavingStateTrainer(false)
    }
  }

  return (
    <SettingsLayout id="analysis-settings-page" footerId="analysis-settings-footer">
      <div className="space-y-6">
        <PageHeader
          title="Análise de vídeo"
          subtitle="Serviço YOLO usado por classificação de estado — detectores de objetos (por câmera) e fine-tuning (por trainer) têm seu próprio cadastro em Configurações → Detectores/Treinadores."
        />

        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <label
            htmlFor="analysis-state-trainer"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Serviço usado por classificação de estado
          </label>
          <select
            id="analysis-state-trainer"
            className="w-full bg-surface-2 text-foreground text-sm rounded px-3 py-2 border border-border focus:outline-none focus:border-ring disabled:opacity-60"
            value={cfg.state_trainer_id ?? ''}
            disabled={savingStateTrainer}
            onChange={(e) => handleStateTrainerChange(e.target.value)}
          >
            <option value="">Nenhum</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {trainers.length === 0 ? (
            <p className="text-xs text-muted-foreground mt-1">
              Nenhum trainer cadastrado — cadastre um em Configurações → Treinadores.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Aponta pro mesmo serviço YOLO já cadastrado ali — sem digitar a URL de novo.
            </p>
          )}
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>

        <div className="bg-surface-2 rounded-lg border border-border p-4">
          <h4 className="text-sm font-medium text-foreground mb-2">Como usar</h4>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>
              Suba o serviço YOLO:{' '}
              <code className="bg-surface-2 px-1 rounded">docker compose --profile yolo up -d</code>
            </li>
            <li>
              Cadastre um detector em Configurações → Detectores de objetos apontando pro serviço
              (YOLO ou Hugging Face, cada um com seus próprios campos)
            </li>
            <li>
              Escolha esse detector por câmera em Configurações → Câmeras → Análise — só a partir
              daí as gravações concluídas passam a ser analisadas automaticamente
            </li>
            <li>
              Pra treinar um modelo personalizado (fine-tuning, abaixo), cadastre um trainer em
              Configurações → Treinadores apontando pro mesmo serviço YOLO
            </li>
            <li>
              Pra classificação de estado (Configurações → Câmeras → Estados), escolha acima qual
              trainer cadastrado fornece o serviço
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
              <code className="bg-surface-2 px-1 rounded">custom.pt</code>) fica disponível pra
              qualquer detector cadastrado que aponte pro modelo <code>custom</code>.
            </p>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <label
                htmlFor="analysis-trainer"
                className="block text-xs font-medium text-muted-foreground mb-1"
              >
                Trainer
              </label>
              <select
                id="analysis-trainer"
                className="w-full bg-surface-2 text-foreground text-sm rounded px-3 py-2 border border-border focus:outline-none focus:border-ring"
                value={trainerId ?? ''}
                disabled={ftActive}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null
                  setTrainerId(v)
                  if (v) localStorage.setItem('ft_trainer_id', String(v))
                  else localStorage.removeItem('ft_trainer_id')
                }}
              >
                <option value="">Selecione um trainer</option>
                {trainers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {trainers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Nenhum trainer cadastrado — cadastre um em Configurações → Treinadores.
                </p>
              )}
            </div>
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
                disabled={(!annCount && !labelCount) || ftActive || !trainerId}
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
