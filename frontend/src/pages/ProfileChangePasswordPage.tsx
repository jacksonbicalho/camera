import { useState, type FormEvent } from 'react'
import ProfileLayout from '../components/ProfileLayout'
import { getUsername, changePassword, login, clearToken } from '../auth'
import { Loader2 } from '../components/Icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ProfileChangePasswordPage — form de troca de senha dentro do ProfileLayout (mantém os links
// do Perfil visíveis à esquerda). Não reaproveita ChangePasswordPage.tsx: aquela página tem
// lógica de redirect específica do fluxo forçado de primeiro login (postChangeRedirect) que não
// se aplica aqui — chamar a mesma API (changePassword + relogin) num form pequeno, dedicado, é
// mais simples que forçar uma abstração compartilhada pra 2 casos que divergem no que acontece
// depois de salvar.
export default function ProfileChangePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
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
    setMessage('')
    setLoading(true)
    try {
      await changePassword(password)
      clearToken()
      await login(username, password)
      setPassword('')
      setConfirm('')
      setMessage('Senha alterada com sucesso.')
    } catch {
      setError('Falha ao alterar senha. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProfileLayout>
      <div id="profile-change-password" className="max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="profile-password-new" className="mb-1 block text-muted-foreground">
              Nova senha
            </Label>
            <Input
              id="profile-password-new"
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
            <Label htmlFor="profile-password-confirm" className="mb-1 block text-muted-foreground">
              Confirmar senha
            </Label>
            <Input
              id="profile-password-confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              aria-invalid={error ? 'true' : undefined}
            />
          </div>
          {error && <p role="alert" className="text-danger text-sm">{error}</p>}
          {message && <p className="text-success text-sm">{message}</p>}
          <Button id="profile-password-submit" type="submit" disabled={loading} className="self-start">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Salvando...' : 'Definir nova senha'}
          </Button>
        </form>
      </div>
    </ProfileLayout>
  )
}
