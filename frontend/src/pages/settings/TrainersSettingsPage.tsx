import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import TrainerForm, { type TrainerFormData } from '../../components/TrainerForm'
import { authHeaders, onUnauthorized } from '../../auth'
import { Button } from '@/components/ui/button'

interface TrainerItem {
  id: number
  name: string
  type: string
  config: Record<string, string>
}

// TrainersSettingsPage — mirror total de ObjectDetectorsSettingsPage: rota
// dedicada pra criação (/settings/trainers/new), sem estado local de "modo
// criação" (mesmo padrão de edição via rota dedicada do CLAUDE.md).
export default function TrainersSettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isNewRoute = location.pathname === '/settings/trainers/new'

  const [trainers, setTrainers] = useState<TrainerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadTrainers = useCallback(async () => {
    const res = await fetch('/api/settings/trainers', { headers: authHeaders() })
    if (res.status === 401) {
      onUnauthorized()
      return
    }
    setTrainers(await res.json())
  }, [])

  useEffect(() => {
    fetch('/api/settings/trainers', { headers: authHeaders() })
      .then(async (res) => {
        if (res.status === 401) {
          onUnauthorized()
          return
        }
        setTrainers(await res.json())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async (data: TrainerFormData) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/trainers', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao criar trainer')
        return
      }
      navigate('/settings/trainers', { replace: true })
      await loadTrainers()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId == null) return
    try {
      await fetch(`/api/settings/trainers/${deleteId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      await loadTrainers()
    } finally {
      setDeleteId(null)
    }
  }

  const trainerToDelete = trainers.find((t) => t.id === deleteId)

  return (
    <SettingsLayout id="trainers-settings-page" footerId="trainers-settings-footer">
      <div className="space-y-4">
        <PageHeader
          title="Treinadores"
          subtitle="Cadastro de treinadores — usados pelo fine-tuning em Configurações → Análise de vídeo."
          actions={
            !isNewRoute && (
              <Button id="trainer-new" asChild size="sm" className="shrink-0">
                <Link to="/settings/trainers/new">Novo trainer</Link>
              </Button>
            )
          }
        />

        {error && (
          <div className="px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
            {error}
          </div>
        )}

        {isNewRoute && (
          <div className="bg-surface border border-border rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Novo trainer</p>
            <TrainerForm
              onSave={handleCreate}
              onCancel={() => navigate('/settings/trainers', { replace: true })}
              saving={saving}
            />
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : trainers.length === 0 ? (
          !isNewRoute && <p className="text-muted-foreground text-sm">Nenhum trainer cadastrado.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {trainers.map((t) => (
              <div key={t.id} className="bg-surface border border-border rounded-lg px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate min-w-0">
                    {t.name}
                  </span>
                  {t.config.service_url && (
                    <span className="text-xs text-muted-foreground truncate">
                      {t.config.service_url}
                    </span>
                  )}
                  {t.config.model && (
                    <span className="text-xs text-muted-foreground truncate">{t.config.model}</span>
                  )}
                  <div className="ml-auto flex items-center gap-1 pl-3 shrink-0">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/settings/trainers/edit/${t.id}`}>Editar</Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(t.id)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteId != null}
        title="Remover trainer"
        message={`Remover "${trainerToDelete?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </SettingsLayout>
  )
}
