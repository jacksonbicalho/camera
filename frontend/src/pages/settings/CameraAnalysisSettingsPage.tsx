import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import { authHeaders } from '../../auth'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface ObjectDetectorItem {
  id: number
  name: string
}

interface CameraOption {
  id: string
  name: string
}

const DEFAULT_THRESHOLD = 0.4

export default function CameraAnalysisSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Câmeras pra popular o <select> de troca — fetch direto (não via
  // useSettings), mesmo padrão de report-camera-select em ReportsPage.
  const [cameras, setCameras] = useState<CameraOption[]>([])
  useEffect(() => {
    fetch('/api/cameras', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: CameraOption[]) => setCameras(Array.isArray(list) ? list : []))
      .catch(() => {})
  }, [])
  const cam = cameras.find((c) => c.id === id)

  const [enabled, setEnabled] = useState(false)
  const [detectors, setDetectors] = useState<ObjectDetectorItem[]>([])
  const [detectorId, setDetectorId] = useState('')
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Habilitado sem detector é um estado inválido pra persistir (não faz
  // nada de fato — analyzeNewRecordings exige detector_id) e confuso pro
  // usuário reencontrar depois. Bloqueia o salvamento em vez de deixar
  // silenciosamente.
  const needsDetector = enabled && detectorId === ''

  useEffect(() => {
    if (!id) return
    Promise.all([
      fetch(`/api/settings/cameras/${id}/analysis`, { headers: authHeaders() }).then((r) =>
        r.json(),
      ),
      fetch('/api/settings/detectors', { headers: authHeaders() }).then((r) => r.json()),
    ])
      .then(([cfg, detectorList]) => {
        setEnabled(Boolean(cfg.enabled))
        setDetectorId(cfg.detector_id != null ? String(cfg.detector_id) : '')
        setThreshold(cfg.confidence_threshold ?? DEFAULT_THRESHOLD)
        setDetectors(detectorList ?? [])
      })
      .catch(() => setError('Falha ao carregar configuração'))
  }, [id])

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/cameras/${id}/analysis`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          detector_id: detectorId === '' ? null : Number(detectorId),
          confidence_threshold: detectorId === '' ? null : threshold,
        }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } else {
        setError('Erro ao salvar')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout id="camera-analysis-page" footerId="camera-analysis-footer">
      <PageHeader
        title="Análise por câmera"
        subtitle={
          cam?.name && (
            <span id="analysis-camera-name" className="block text-base font-medium text-foreground">
              {cam.name}
            </span>
          )
        }
        actions={
          <select
            id="analysis-camera-select"
            aria-label="Câmera"
            value={id}
            onChange={(e) => navigate(`/settings/analyses/${e.target.value}`, { replace: true })}
            disabled={cameras.length <= 1}
            className="bg-surface-2 text-foreground text-xs rounded px-2 py-1 border border-border max-w-44 disabled:opacity-70"
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="space-y-6">
        <div className="bg-surface-2 rounded-lg border border-border divide-y divide-border">
          <div className="p-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="camera-analysis-enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="accent-primary"
              />
              <label
                htmlFor="camera-analysis-enabled"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                Habilitado
              </label>
            </div>
          </div>

          {enabled && (
            <>
              <div className="p-4">
                <Label
                  htmlFor="camera-analysis-detector"
                  className="block text-xs text-muted-foreground mb-1"
                >
                  Detector
                </Label>
                <select
                  id="camera-analysis-detector"
                  value={detectorId}
                  onChange={(e) => setDetectorId(e.target.value)}
                  className="w-full bg-surface-2 text-foreground text-sm rounded px-3 py-2 border border-border focus:outline-none focus:border-ring"
                >
                  <option value="">Nenhum</option>
                  {detectors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Detector cadastrado usado nas gravações desta câmera.
                </p>
              </div>

              <div className="p-4">
                <Label
                  htmlFor="camera-analysis-threshold"
                  className="block text-xs text-muted-foreground mb-1"
                >
                  Limiar de confiança ({(threshold * 100).toFixed(0)}%)
                </Label>
                <input
                  id="camera-analysis-threshold"
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  disabled={detectorId === ''}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-primary disabled:opacity-40"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  <span>10%</span>
                  <span>90%</span>
                </div>
              </div>
            </>
          )}

          <div className="p-4 flex items-center justify-between">
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!error && saved && <p className="text-sm text-green-400">Salvo</p>}
            {!error && !saved && needsDetector && (
              <p className="text-xs text-amber-400">
                Selecione um detector pra habilitar a análise.
              </p>
            )}
            {!error && !saved && !needsDetector && <span />}
            <Button
              id="camera-analysis-save"
              onClick={handleSave}
              disabled={saving || needsDetector}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>
    </SettingsLayout>
  )
}
