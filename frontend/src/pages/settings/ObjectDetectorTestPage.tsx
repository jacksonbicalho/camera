import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import EntitySubtitle from '../../components/EntitySubtitle'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { authHeaders, onUnauthorized } from '../../auth'

interface Detection {
  label: string
  confidence: number
  frame_count: number
}

interface ObjectDetectorItem {
  id: number
  name: string
  config: Record<string, string>
}

// ObjectDetectorTestPage — teste isolado de um detector (upload avulso, sem
// tocar em nada já gravado no sistema). O backend grava o arquivo num scratch
// dir temporário e o remove logo depois de rodar a inferência (T3). Segue o
// mesmo padrão de breadcrumb + botão de voltar de ObjectDetectorFormPage
// (EntitySubtitle "Detector / Testar" + ação no PageHeader).
const DEFAULT_THRESHOLD = 0.4

export default function ObjectDetectorTestPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detector, setDetector] = useState<ObjectDetectorItem | null>(null)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [detections, setDetections] = useState<Detection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    fetch('/api/settings/detectors', { headers: authHeaders() })
      .then(async (r) => {
        if (r.status === 401) {
          onUnauthorized()
          return
        }
        const list: ObjectDetectorItem[] = await r.json()
        const found = list.find((d) => String(d.id) === id)
        if (found) setDetector(found)
      })
      .catch(() => {})
  }, [id])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setTesting(true)
    setError(null)
    setDetections(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('confidence_threshold', String(threshold))
      const res = await fetch(`/api/settings/detectors/${id}/test`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao testar detector')
        return
      }
      const data = await res.json()
      setDetections(data.detections ?? [])
    } catch {
      setError('Erro ao testar detector')
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingsLayout id="object-detector-test-page" footerId="object-detector-test-footer">
      <PageHeader
        title="Detectores de objetos"
        subtitle={
          <EntitySubtitle
            parent={{ label: detector?.name ?? '...', to: '/settings/detectors' }}
            current="Testar"
          />
        }
        actions={
          <Button
            id="object-detector-test-cancel"
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings/detectors')}
          >
            Voltar
          </Button>
        }
      />

      <p className="text-xs text-muted-foreground mb-4">
        Upload avulso de imagem ou vídeo — não fica salvo no sistema.
      </p>

      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
        <div>
          <Label
            htmlFor="object-detector-test-threshold"
            className="block text-xs text-muted-foreground mb-1"
          >
            Limiar de confiança ({(threshold * 100).toFixed(0)}%)
          </Label>
          <input
            id="object-detector-test-threshold"
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Vale só para este teste — nunca é salvo no detector.
          </p>
        </div>

        <div>
          <Label
            htmlFor="object-detector-test-file"
            className="block text-xs text-muted-foreground mb-1"
          >
            Arquivo (imagem ou vídeo)
          </Label>
          <input
            id="object-detector-test-file"
            type="file"
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="block w-full text-sm text-foreground"
          />
        </div>

        {testing && <p className="text-sm text-muted-foreground">Testando...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {detections &&
          (detections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma detecção.</p>
          ) : (
            <ul className="divide-y divide-border">
              {detections.map((d, i) => (
                <li key={i} className="py-2 flex items-center justify-between text-sm">
                  <span className="text-foreground">{d.label}</span>
                  <span className="text-muted-foreground">{(d.confidence * 100).toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </SettingsLayout>
  )
}
