import { useState } from 'react'
import { useParams } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import { Label } from '@/components/ui/label'
import { authHeaders } from '../../auth'

interface Detection {
  label: string
  confidence: number
  frame_count: number
}

// ObjectDetectorTestPage — teste isolado de um detector (upload avulso, sem
// tocar em nada já gravado no sistema). O backend grava o arquivo num scratch
// dir temporário e o remove logo depois de rodar a inferência (T3).
export default function ObjectDetectorTestPage() {
  const { id } = useParams<{ id: string }>()
  const [detections, setDetections] = useState<Detection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setTesting(true)
    setError(null)
    setDetections(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
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
        title="Testar detector"
        subtitle="Upload avulso de imagem ou vídeo — não fica salvo no sistema."
      />

      <div className="bg-surface border border-border rounded-lg p-4 space-y-4">
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
