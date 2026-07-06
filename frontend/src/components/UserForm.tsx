import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Camera {
  id: string
  name?: string
}

interface User {
  id: number
  username: string
  role: 'admin' | 'viewer'
  cameras: string[]
  email?: string
  name?: string
}

export interface UserFormData {
  username: string
  password: string
  role: 'admin' | 'viewer'
  cameras: string[]
  email: string
  name: string
}

interface UserFormProps {
  cameras: Camera[]
  initial?: User
  onSave: (data: UserFormData) => Promise<void>
  onCancel: () => void
  saving: boolean
  // Na edição, a senha não é um campo do form — é um fluxo dedicado (ChangePasswordPage).
  onChangePassword?: () => void
}

export default function UserForm({ cameras, initial, onSave, onCancel, saving, onChangePassword }: UserFormProps) {
  const [username, setUsername] = useState(initial?.username ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'viewer'>(initial?.role ?? 'viewer')
  const [selectedCameras, setSelectedCameras] = useState<string[]>(initial?.cameras ?? [])
  const [email, setEmail] = useState(initial?.email ?? '')
  const [name, setName] = useState(initial?.name ?? '')

  const toggleCamera = (id: string) => {
    setSelectedCameras(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ username, password, role, cameras: selectedCameras, email, name })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="user-form-username" className="block text-xs text-muted-foreground mb-1">Username</Label>
          <Input
            id="user-form-username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </div>
        {!initial && (
          <div>
            <Label htmlFor="user-form-password" className="block text-xs text-muted-foreground mb-1">Senha</Label>
            <Input
              id="user-form-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
        )}
        <div>
          <Label htmlFor="user-form-email" className="block text-xs text-muted-foreground mb-1">E-mail</Label>
          <Input
            id="user-form-email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="user-form-name" className="block text-xs text-muted-foreground mb-1">Nome</Label>
          <Input
            id="user-form-name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="user-form-role" className="block text-xs text-muted-foreground mb-1">Role</Label>
          <select
            id="user-form-role"
            value={role}
            onChange={e => setRole(e.target.value as 'admin' | 'viewer')}
            className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
        </div>
      </div>

      {role === 'viewer' && cameras.length > 0 && (
        <div>
          <Label className="block text-xs text-muted-foreground mb-2">Câmeras com acesso</Label>
          <div className="flex flex-wrap gap-2">
            {cameras.map(cam => (
              <button
                key={cam.id}
                type="button"
                onClick={() => toggleCamera(cam.id)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${
                  selectedCameras.includes(cam.id)
                    ? 'bg-blue-700 border-blue-600 text-white'
                    : 'bg-surface border-border text-muted-foreground hover:border-faint'
                }`}
              >
                {cam.name || cam.id}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button id="user-form-save" type="submit" size="sm" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button id="user-form-cancel" type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        {initial && onChangePassword && (
          <Button id="user-form-change-password" type="button" size="sm" variant="outline" className="ml-auto" onClick={onChangePassword}>
            Alterar senha
          </Button>
        )}
      </div>
    </form>
  )
}
