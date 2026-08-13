import { useState, useEffect } from 'react'
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom'
import SettingsLayout from '../../components/SettingsLayout'
import PageHeader from '../../components/PageHeader'
import EntitySubtitle from '../../components/EntitySubtitle'
import SettingsSection from '../../components/SettingsSection'
import UserForm, { type UserFormData } from '../../components/UserForm'
import RoleBadge from '../../components/RoleBadge'
import { Plus } from '../../components/Icons'
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

export default function UserDetailSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  // Edição tem URL própria (/settings/users/edit/:id). `editing` é DERIVADO da
  // rota — mesmo padrão de CameraDetailSettingsPage — pra sobreviver a
  // reload/deep-link, ao contrário do `state` de navegação anterior.
  const editing = location.pathname.startsWith('/settings/users/edit/')

  const [user, setUser] = useState<User | null>(null)
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        const users: User[] = await ur.json()
        const found = users.find((u) => String(u.id) === id)
        if (!found) {
          navigate('/settings/users', { replace: true })
          return
        }
        setUser(found)
        setCameras(await cr.json())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id, navigate])

  const handleUpdate = async (data: UserFormData) => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Erro ao atualizar usuário')
        return
      }
      const updated: User[] = await (await fetch('/api/users', { headers: authHeaders() })).json()
      const refreshed = updated.find((u) => u.id === user.id)
      if (refreshed) setUser(refreshed)
      navigate(`/settings/users/${id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsLayout id="user-detail-page" footerId="user-detail-footer">
      <PageHeader
        title="Usuários"
        subtitle={
          editing ? (
            <EntitySubtitle
              parent={{ label: user?.username ?? '...', to: '/settings/users' }}
              current="Editar"
            />
          ) : (
            (user?.username ?? '...')
          )
        }
        actions={
          <div className="flex items-center gap-2">
            {user && !editing && (
              <Button
                id="user-edit"
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null)
                  navigate(`/settings/users/edit/${id}`)
                }}
              >
                Editar
              </Button>
            )}
            <Button asChild size="sm">
              <Link to="/settings/users/new">
                <Plus className="w-3.5 h-3.5" /> Novo usuário
              </Link>
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : !user ? null : editing ? (
        <UserForm
          cameras={cameras}
          initial={user}
          onSave={handleUpdate}
          onCancel={() => {
            setError(null)
            navigate(`/settings/users/${id}`)
          }}
          saving={saving}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <SettingsSection
            title="Conta"
            fields={[
              { label: 'Username', value: user.username },
              ...(user.name ? [{ label: 'Nome', value: user.name }] : []),
              ...(user.email ? [{ label: 'E-mail', value: user.email }] : []),
              { label: 'Role', value: <RoleBadge role={user.role} /> },
              {
                label: 'Câmeras',
                value:
                  user.role === 'admin'
                    ? 'todas'
                    : user.cameras.length === 0
                      ? 'nenhuma'
                      : user.cameras
                          .map((camId) => cameras.find((c) => c.id === camId)?.name || camId)
                          .join(', '),
              },
              { label: 'Criado em', value: new Date(user.created_at).toLocaleString('pt-BR') },
            ]}
          />
        </div>
      )}
    </SettingsLayout>
  )
}
