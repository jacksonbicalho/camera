import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import ConfirmDialog from '../../components/ConfirmDialog'
import UserForm, { type UserFormData } from '../../components/UserForm'
import RoleBadge from '../../components/RoleBadge'
import { authHeaders, onUnauthorized } from '../../auth'
import { Button } from '@/components/ui/button'

interface Camera {
  id: string
  name?: string
}

interface User {
  id: number
  username: string
  role: 'admin' | 'viewer'
  cameras: string[]
  created_at: string
  email?: string
  name?: string
}

export default function UsersSettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isNewRoute = location.pathname === '/settings/users/new'

  const [users, setUsers] = useState<User[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(isNewRoute)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/users', { headers: authHeaders() })
    if (res.status === 401) {
      onUnauthorized()
      return
    }
    if (res.status === 403) {
      navigate('/', { replace: true })
      return
    }
    setUsers(await res.json())
  }, [navigate])

  useEffect(() => {
    Promise.all([
      fetch('/api/users', { headers: authHeaders() }),
      fetch('/api/cameras', { headers: authHeaders() }),
    ])
      .then(async ([ur, cr]) => {
        if (ur.status === 401 || cr.status === 401) {
          onUnauthorized()
          return
        }
        if (ur.status === 403) {
          navigate('/', { replace: true })
          return
        }
        setUsers(await ur.json())
        setCameras(await cr.json())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [navigate])

  const handleCreate = async (data: UserFormData) => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao criar usuário')
        return
      }
      if (isNewRoute) {
        navigate('/settings/users', { replace: true })
        return
      }
      await loadUsers()
      setCreating(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId == null) return
    setError(null)
    try {
      const res = await fetch(`/api/users/${deleteId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao remover usuário')
        return
      }
      await loadUsers()
    } finally {
      setDeleteId(null)
    }
  }

  const userToDelete = users.find((u) => u.id === deleteId)

  return (
    <SettingsLayout id="users-settings-page" footerId="users-settings-footer">
      <PageHeader
        title="Usuários"
        subtitle="Gerencie usuários e permissões de acesso."
        actions={
          !creating && (
            <Button
              id="user-create"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setCreating(true)
                setError(null)
              }}
            >
              + Novo usuário
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {creating && (
        <div className="mb-4 bg-surface border border-border rounded-lg p-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Novo usuário</p>
          <UserForm
            cameras={cameras}
            onSave={handleCreate}
            onCancel={() => {
              if (isNewRoute) {
                navigate('/settings/users', { replace: true })
                return
              }
              setCreating(false)
              setError(null)
            }}
            saving={saving}
          />
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum usuário.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((user) => {
            const camerasText =
              user.role === 'admin'
                ? 'todas'
                : user.cameras.length === 0
                  ? 'sem câmeras'
                  : user.cameras
                      .map((camId) => cameras.find((c) => c.id === camId)?.name || camId)
                      .join(', ')
            return (
              <div key={user.id} className="bg-surface border border-border rounded-lg px-4 py-3">
                {/* Grid de colunas fixas (username/nome/role/câmeras/ações) — as 5
                    células são SEMPRE renderizadas (mesmo vazias, fallback '—') pra
                    manter o alinhamento entre linhas; um item de grid ausente faria
                    os seguintes ocuparem a coluna errada. */}
                <div
                  id={`user-row-${user.id}`}
                  className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[10rem_10rem_5rem_1fr_auto] sm:gap-3"
                >
                  <Link
                    id={`user-row-${user.id}-username`}
                    to={`/settings/users/${user.id}`}
                    title={user.username}
                    className="min-w-0 truncate text-sm font-mono text-foreground transition-colors hover:text-primary"
                  >
                    {user.username}
                  </Link>
                  <span
                    id={`user-row-${user.id}-name`}
                    title={user.name || undefined}
                    className="min-w-0 truncate text-xs text-muted-foreground"
                  >
                    {user.name || '—'}
                  </span>
                  <div id={`user-row-${user.id}-role`} className="min-w-0">
                    <RoleBadge role={user.role} />
                  </div>
                  <span
                    id={`user-row-${user.id}-cameras`}
                    title={camerasText}
                    className="min-w-0 truncate text-xs text-muted-foreground"
                  >
                    {camerasText}
                  </span>
                  <div
                    id={`user-row-${user.id}-actions`}
                    className="flex items-center gap-1 sm:justify-end"
                  >
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/settings/users/edit/${user.id}`}>Editar</Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(user.id)}
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleteId != null}
        title="Remover usuário"
        message={`Remover "${userToDelete?.username}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </SettingsLayout>
  )
}
