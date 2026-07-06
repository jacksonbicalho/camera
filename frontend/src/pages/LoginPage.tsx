import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { login, mustChangePassword, getToken } from '../auth'
import { CameraLogo, Loader2 } from '../components/Icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  // Guard inverso ao das rotas protegidas (App.tsx: RequireAuth): se já existe
  // token válido ao montar, não faz sentido mostrar o login de novo.
  useEffect(() => {
    if (!getToken()) return
    navigate(mustChangePassword() ? '/change-password' : from, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate(mustChangePassword() ? '/change-password' : from, { replace: true })
    } catch {
      setError('Usuário ou senha inválidos')
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
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="login-username" className="block text-muted-foreground mb-1">Usuário</Label>
            <Input
              id="login-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              aria-invalid={error ? 'true' : undefined}
            />
          </div>
          <div>
            <Label htmlFor="login-password" className="block text-muted-foreground mb-1">Senha</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-invalid={error ? 'true' : undefined}
            />
          </div>
          {error && <p role="alert" className="text-danger text-sm">{error}</p>}
          <Button id="login-submit" type="submit" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  )
}
