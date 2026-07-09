import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { login, mustChangePassword, getToken } from '../auth'
import { CameraLogo, Loader2 } from '../components/Icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Default desmarcado (opt-in): sem escolha explícita, o login não persiste em
  // localStorage — evita repopular o campo como marcado (e o token sobrevivendo) a cada
  // novo carregamento da tela, independente do que o usuário escolheu da última vez.
  const [remember, setRemember] = useState(false)
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
      await login(identifier, password, remember)
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
        <p className="text-sm text-muted-foreground text-center mb-6">
          Entre para monitorar suas câmeras em tempo real.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="login-username" className="block text-muted-foreground mb-1">
              Usuário ou e-mail
            </Label>
            <Input
              id="login-username"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              placeholder="usuario ou voce@exemplo.com"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby="login-username-hint"
            />
            <p id="login-username-hint" className="mt-1 text-caption text-muted">
              Você pode entrar com seu usuário ou e-mail cadastrado.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="login-password" className="text-muted-foreground">
                Senha
              </Label>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-xs text-primary hover:underline"
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-invalid={error ? 'true' : undefined}
            />
          </div>
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between">
            <label
              htmlFor="login-remember"
              className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none"
            >
              <input
                id="login-remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="accent-primary cursor-pointer"
              />
              Lembrar de mim
            </label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Esqueceu a senha?
            </Link>
          </div>
          <Button id="login-submit" type="submit" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  )
}
