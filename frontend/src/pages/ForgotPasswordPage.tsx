import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CameraLogo, Loader2 } from '../components/Icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      /* mensagem genérica de qualquer forma — não vazamos se o e-mail existe */
    } finally {
      setSent(true)
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
        {sent ? (
          <p className="text-sm text-muted-foreground text-center">
            Se o e-mail existir na nossa base, você vai receber um link para redefinir a senha em
            instantes.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground text-center mb-2">
              Informe seu e-mail para receber um link de redefinição de senha.
            </p>
            <div>
              <Label htmlFor="forgot-email" className="block text-muted-foreground mb-1">
                E-mail
              </Label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <Button id="forgot-submit" type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Enviando...' : 'Enviar'}
            </Button>
          </form>
        )}
        <p className="text-xs text-center mt-4">
          <Link to="/login" className="text-primary hover:underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  )
}
