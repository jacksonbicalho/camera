import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import EntitySubtitle from '../../components/EntitySubtitle'
import ObjectDetectorForm, {
  type ObjectDetectorFormData,
} from '../../components/ObjectDetectorForm'
import { authHeaders, onUnauthorized } from '../../auth'

interface ObjectDetectorItem {
  id: number
  name: string
  config: Record<string, string>
}

// ObjectDetectorFormPage — só a rota de edição (/settings/detectors/edit/:id);
// a criação é inline em ObjectDetectorsSettingsPage (/settings/detectors/new).
export default function ObjectDetectorFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detector, setDetector] = useState<ObjectDetectorItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/detectors', { headers: authHeaders() })
      .then(async (r) => {
        if (r.status === 401) {
          onUnauthorized()
          return
        }
        const list: ObjectDetectorItem[] = await r.json()
        const found = list.find((d) => String(d.id) === id)
        if (!found) {
          navigate('/settings/detectors', { replace: true })
          return
        }
        setDetector(found)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, navigate])

  const handleUpdate = async (data: ObjectDetectorFormData) => {
    if (!detector) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/detectors/${detector.id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao atualizar detector')
        return
      }
      navigate('/settings/detectors')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout id="object-detector-form-page" footerId="object-detector-form-footer">
      <PageHeader
        title="Detectores de objetos"
        subtitle={
          <EntitySubtitle
            parent={{ label: detector?.name ?? '...', to: '/settings/detectors' }}
            current="Editar"
          />
        }
      />

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : !detector ? null : (
        <ObjectDetectorForm
          initial={detector}
          onSave={handleUpdate}
          onCancel={() => navigate('/settings/detectors')}
          saving={saving}
        />
      )}
    </SettingsLayout>
  )
}
