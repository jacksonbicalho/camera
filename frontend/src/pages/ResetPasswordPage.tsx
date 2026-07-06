import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CameraLogo, Loader2 } from '../components/Icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

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
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (!res.ok) {
        setError('Link inválido ou expirado. Solicite um novo.')
        return
      }
      navigate('/login', { replace: true })
    } catch {
      setError('Falha ao redefinir a senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm bg-surface rounded-lg p-5 shadow-xl border border-border">
        <div className="flex flex-col items-center gap-2 mb-6">
          <CameraLogo className="w-12 h-12" />
          <span className="text-foreground font-semibold text-lg tracking-wide">os-camera</span>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-6 text-center">Redefinir senha</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="reset-password-new" className="block text-muted-foreground mb-1">Nova senha</Label>
            <Input
              id="reset-password-new"
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
            <Label htmlFor="reset-password-confirm" className="block text-muted-foreground mb-1">Confirmar senha</Label>
            <Input
              id="reset-password-confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              aria-invalid={error ? 'true' : undefined}
            />
          </div>
          {error && <p role="alert" className="text-danger text-sm">{error}</p>}
          <Button id="reset-password-submit" type="submit" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Redefinindo...' : 'Redefinir senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
