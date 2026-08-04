import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import ObjectDetectorForm, {
  type ObjectDetectorFormData,
} from '../../components/ObjectDetectorForm'
import { authHeaders, onUnauthorized } from '../../auth'
import { Button } from '@/components/ui/button'

interface ObjectDetectorItem {
  id: number
  name: string
  config: Record<string, string>
}

export default function ObjectDetectorsSettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  // Rota dedicada pra criação — sem estado local pra "modo criação" (mesmo
  // padrão de edição via rota dedicada do CLAUDE.md, aplicado aqui à criação).
  const isNewRoute = location.pathname === '/settings/detectors/new'

  const [detectors, setDetectors] = useState<ObjectDetectorItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadDetectors = useCallback(async () => {
    const res = await fetch('/api/settings/detectors', { headers: authHeaders() })
    if (res.status === 401) {
      onUnauthorized()
      return
    }
    setDetectors(await res.json())
  }, [])

  useEffect(() => {
    fetch('/api/settings/detectors', { headers: authHeaders() })
      .then(async (res) => {
        if (res.status === 401) {
          onUnauthorized()
          return
        }
        setDetectors(await res.json())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleCreate = async (data: ObjectDetectorFormData) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/detectors', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao criar detector')
        return
      }
      navigate('/settings/detectors', { replace: true })
      await loadDetectors()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId == null) return
    try {
      await fetch(`/api/settings/detectors/${deleteId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      await loadDetectors()
    } finally {
      setDeleteId(null)
    }
  }

  const detectorToDelete = detectors.find((d) => d.id === deleteId)

  return (
    <SettingsLayout id="object-detectors-settings-page" footerId="object-detectors-settings-footer">
      <div className="space-y-4">
        <PageHeader
          title="Detectores de objetos"
          subtitle="Cadastro de detectores de objetos (serviço YOLO) — desacoplado das câmeras por enquanto."
          actions={
            !isNewRoute && (
              <Button id="object-detector-new" asChild size="sm" className="shrink-0">
                <Link to="/settings/detectors/new">Novo detector</Link>
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
            <p className="text-xs font-medium text-muted-foreground mb-3">Novo detector</p>
            <ObjectDetectorForm
              onSave={handleCreate}
              onCancel={() => navigate('/settings/detectors', { replace: true })}
              saving={saving}
            />
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : detectors.length === 0 ? (
          !isNewRoute && (
            <p className="text-muted-foreground text-sm">Nenhum detector cadastrado.</p>
          )
        ) : (
          <div className="flex flex-col gap-2">
            {detectors.map((det) => (
              <div key={det.id} className="bg-surface border border-border rounded-lg px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate min-w-0">
                    {det.name}
                  </span>
                  {det.config.model && (
                    <span className="text-xs text-muted-foreground truncate">
                      {det.config.model}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1 pl-3 shrink-0">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/settings/detectors/test/${det.id}`}>Testar</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/settings/detectors/edit/${det.id}`}>Editar</Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(det.id)}
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
        title="Remover detector"
        message={`Remover "${detectorToDelete?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </SettingsLayout>
  )
}
