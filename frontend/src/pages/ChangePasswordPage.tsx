import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { getUsername, changePassword, login, clearToken, getRole, authHeaders, mustChangePassword } from '../auth'
import { Loader2 } from '../components/Icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { postChangeRedirect } from './changePasswordRedirect'

// ChangePasswordPage — só o fluxo forçado de 1º login (must_change_password=true).
// Trocar a senha já logado tem seus próprios fluxos dedicados: auto-serviço em
// ProfileChangePasswordPage (Perfil), e admin resetando a de outro usuário via o
// campo "Senha" (opcional) do UserForm, direto no PUT /api/users/:id.
export default function ChangePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const username = getUsername() ?? ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('As senhas não coincidem')
      return
    }
    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres')
      return
    }
    setError('')
    setLoading(true)
    try {
      await changePassword(password)
      clearToken()
      await login(username, password)
      let adminWithNoCameras = false
      try {
        const res = await fetch('/api/cameras', { headers: authHeaders() })
        const data = res.ok ? await res.json() : []
        adminWithNoCameras = Array.isArray(data) && data.length === 0 && getRole() === 'admin'
      } catch { /* ignore, segue para o fallback */ }
      navigate(postChangeRedirect({ adminWithNoCameras }), { replace: true })
    } catch {
      setError('Falha ao alterar senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!mustChangePassword()) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm bg-surface rounded-lg p-5 shadow-xl border border-border">
        <p className="text-sm text-muted-foreground text-center mb-6">
          Por segurança, defina uma nova senha antes de continuar.
        </p>
        <h2 className="text-lg font-semibold text-foreground mb-6">Alterar senha</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="change-password-new" className="block text-muted-foreground mb-1">Nova senha</Label>
            <Input
              id="change-password-new"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              minLength={8}
              autoComplete="new-password"
              aria-invalid={error ? 'true' : undefined}
            />
          </div>
          <div>
            <Label htmlFor="change-password-confirm" className="block text-muted-foreground mb-1">Confirmar senha</Label>
            <Input
              id="change-password-confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              aria-invalid={error ? 'true' : undefined}
            />
          </div>
          {error && <p role="alert" className="text-danger text-sm">{error}</p>}
          <Button id="change-password-submit" type="submit" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Salvando...' : 'Definir nova senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
