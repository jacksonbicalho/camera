import { useState, useEffect, useCallback, useRef } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import CameraForm from '../../components/CameraForm'
import CameraCard from '../../components/CameraCard'
import Spinner from '../../components/Spinner'
import { type Camera, type CameraFormData, formToPayload } from '../../components/cameraFormUtils'
import { authHeaders, onUnauthorized, getRole, getToken } from '../../auth'
import { Plus, Settings, Trash2 } from '../../components/Icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function CamerasSettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const isAdmin = getRole() === 'admin'
  const isNewRoute = location.pathname === '/settings/cameras/new'
  const prefillRTSP = searchParams.get('prefill_rtsp') ?? ''
  const prefillName = searchParams.get('prefill_name') ?? ''
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const creating = isNewRoute
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteData, setDeleteData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noDb, setNoDb] = useState(false)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)

  const reloadCameras = useCallback(async () => {
    const res = await fetch('/api/settings/cameras', { headers: authHeaders() })
    if (res.status === 401) {
      onUnauthorized()
      return
    }
    if (res.status === 503) {
      setNoDb(true)
      return
    }
    if (res.ok) setCameras(await res.json())
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/settings/cameras', { headers: authHeaders() })
      .then(async (res) => {
        if (res.status === 401) {
          onUnauthorized()
          return
        }
        if (res.status === 503) {
          setNoDb(true)
          return
        }
        if (res.ok) setCameras(await res.json())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAdmin, navigate])

  useEffect(() => {
    if (isAdmin) return
    fetch('/api/cameras', { headers: authHeaders() })
      .then(async (res) => {
        if (res.status === 401) {
          onUnauthorized()
          return
        }
        if (res.ok) setCameras(await res.json())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAdmin, navigate])

  const handleCreate = async (data: CameraFormData) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/cameras', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(formToPayload(data)),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao criar câmera')
        return
      }
      navigate('/settings/cameras', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const url = deleteData
      ? `/api/settings/cameras/${deleteId}?delete_data=true`
      : `/api/settings/cameras/${deleteId}`
    try {
      await fetch(url, { method: 'DELETE', headers: authHeaders() })
      await reloadCameras()
    } finally {
      setDeleteId(null)
      setDeleteData(false)
    }
  }

  const handleDrop = async (targetId: string) => {
    const sourceId = dragIdRef.current
    dragIdRef.current = null
    setDragOverId(null)
    if (!sourceId || sourceId === targetId) return

    const reordered = [...cameras]
    const fromIdx = reordered.findIndex((c) => c.id === sourceId)
    const toIdx = reordered.findIndex((c) => c.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return

    reordered.splice(toIdx, 0, reordered.splice(fromIdx, 1)[0])
    setCameras(reordered)

    await fetch('/api/settings/cameras/reorder', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map((c) => c.id) }),
    })
  }

  const camToDelete = cameras.find((c) => c.id === deleteId)

  if (!isAdmin) {
    return (
      <SettingsLayout id="cameras-settings-page" footerId="cameras-settings-footer">
        <PageHeader title="Câmeras" />
        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : cameras.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma câmera disponível.</p>
        ) : (
          <div id="cameras-grid" className="flex flex-row flex-wrap gap-6">
            {cameras.map((cam) => (
              // Sem ação nenhuma (viewer) — o card inteiro navega; ao
              // contrário do admin, não é draggable, então não há disputa
              // entre o gesto de arrastar e o link.
              <Link key={cam.id} to={`/settings/cameras/${cam.id}`} className="contents">
                <CameraCard
                  id={`camera-card-${cam.id}`}
                  thumbnail={<ThumbnailImage cameraId={cam.id} name={cam.name} />}
                  name={cam.name || cam.id}
                  badges={<StatusBadges cam={cam} />}
                  className="hover:border-primary transition-colors"
                />
              </Link>
            ))}
          </div>
        )}
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout id="cameras-settings-page" footerId="cameras-settings-footer">
      <PageHeader
        title="Câmeras"
        subtitle={creating ? 'Nova câmera' : undefined}
        actions={
          !creating &&
          !noDb && (
            <Button
              id="camera-create"
              onClick={() => {
                setError(null)
                navigate('/settings/cameras/new')
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              Nova câmera
            </Button>
          )
        }
      />

      {noDb && (
        <p className="text-muted-foreground text-sm">
          Gerenciamento de câmeras requer banco de dados configurado.
        </p>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {creating && (
        <div className="mb-4 bg-surface border border-border rounded-lg p-4">
          <CameraForm
            onSave={handleCreate}
            onCancel={() => {
              setError(null)
              navigate('/settings/cameras', { replace: true })
            }}
            saving={saving}
            prefillRtsp={prefillRTSP || undefined}
            prefillName={prefillName || undefined}
          />
        </div>
      )}

      {!isNewRoute &&
        (loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : cameras.length === 0 && !noDb ? (
          <p className="text-muted-foreground text-sm">Nenhuma câmera configurada.</p>
        ) : (
          <div id="cameras-grid" className="flex flex-row flex-wrap gap-6">
            {cameras.map((cam) => (
              <CameraCard
                key={cam.id}
                id={`camera-card-${cam.id}`}
                thumbnail={<ThumbnailImage cameraId={cam.id} name={cam.name} />}
                name={cam.name || cam.id}
                badges={<StatusBadges cam={cam} />}
                draggable
                onDragStart={() => {
                  dragIdRef.current = cam.id
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverId(cam.id)
                }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={() => handleDrop(cam.id)}
                onDragEnd={() => {
                  dragIdRef.current = null
                  setDragOverId(null)
                }}
                className={
                  dragOverId === cam.id
                    ? 'border-primary'
                    : 'hover:border-primary transition-colors'
                }
              >
                <Button asChild variant="outline" size="sm">
                  {/* draggable=false: <a> é arrastável nativamente por
                      padrão (like <img>) — sem isso, começar o gesto de
                      arrastar em cima do botão dispara o drag nativo do
                      link em vez de borbulhar pro drag customizado do
                      card. */}
                  <Link to={`/settings/cameras/${cam.id}`} draggable={false}>
                    <Settings className="w-3.5 h-3.5" />
                    Configurar
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteId(cam.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </Button>
              </CameraCard>
            ))}
          </div>
        ))}

      <ConfirmDialog
        id="delete-camera-modal"
        open={deleteId != null}
        title="Remover câmera"
        message={`Remover câmera "${camToDelete?.name || camToDelete?.id}"?`}
        confirmLabel="Remover"
        confirmId="delete-camera-confirm"
        danger
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteId(null)
          setDeleteData(false)
        }}
      >
        <label htmlFor="delete-camera-data-checkbox" className="flex items-center gap-2 cursor-pointer">
          <input
            id="delete-camera-data-checkbox"
            type="checkbox"
            checked={deleteData}
            onChange={(e) => setDeleteData(e.target.checked)}
            className="accent-red-500"
          />
          <span className="text-xs text-foreground">Apagar também as gravações do disco</span>
        </label>
      </ConfirmDialog>
    </SettingsLayout>
  )
}

function ThumbnailImage({ cameraId, name }: { cameraId: string; name?: string }) {
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {!loaded && !errored && <Spinner className="w-6 h-6 text-muted-foreground" />}
      {!errored && (
        <img
          src={`/api/cameras/${cameraId}/snapshot?token=${getToken()}`}
          alt={name || cameraId}
          draggable={false}
          className={`absolute inset-0 w-full h-full object-cover${loaded ? '' : ' opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
    </div>
  )
}

function StatusBadges({ cam }: { cam: Camera }) {
  return (
    <>
      {cam.motion?.enabled && <Badge variant="success">Detecção</Badge>}
      {cam.recording_enabled && <Badge variant="danger">Gravando</Badge>}
    </>
  )
}
