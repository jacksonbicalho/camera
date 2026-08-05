import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import EntitySubtitle from '../../components/EntitySubtitle'
import TrainerForm, { type TrainerFormData } from '../../components/TrainerForm'
import { authHeaders, onUnauthorized } from '../../auth'

interface TrainerItem {
  id: number
  name: string
  config: Record<string, string>
}

// TrainerFormPage — só a rota de edição (/settings/trainers/edit/:id);
// a criação é inline em TrainersSettingsPage (/settings/trainers/new) —
// mirror total de ObjectDetectorFormPage.
export default function TrainerFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [trainer, setTrainer] = useState<TrainerItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/trainers', { headers: authHeaders() })
      .then(async (r) => {
        if (r.status === 401) {
          onUnauthorized()
          return
        }
        const list: TrainerItem[] = await r.json()
        const found = list.find((t) => String(t.id) === id)
        if (!found) {
          navigate('/settings/trainers', { replace: true })
          return
        }
        setTrainer(found)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, navigate])

  const handleUpdate = async (data: TrainerFormData) => {
    if (!trainer) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/trainers/${trainer.id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao atualizar trainer')
        return
      }
      navigate('/settings/trainers')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout id="trainer-form-page" footerId="trainer-form-footer">
      <PageHeader
        title="Treinadores"
        subtitle={
          <EntitySubtitle
            parent={{ label: trainer?.name ?? '...', to: '/settings/trainers' }}
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
      ) : !trainer ? null : (
        <TrainerForm
          initial={trainer}
          onSave={handleUpdate}
          onCancel={() => navigate('/settings/trainers')}
          saving={saving}
        />
      )}
    </SettingsLayout>
  )
}
