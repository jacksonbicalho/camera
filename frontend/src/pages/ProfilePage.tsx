import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ProfileLayout from '../components/ProfileLayout'
import TelegramLinkSection from '../components/TelegramLinkSection'
import PushSubscriptionSection from '../components/PushSubscriptionSection'
import { authHeaders, onUnauthorized } from '../auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from '../components/Icons'

interface Profile {
  username: string
  email: string
  name: string
  role: string
}

function Field({ label, value, action }: { label: string; value: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="text-caption text-muted">{label}</p>
        <p className="text-body text-foreground">{value}</p>
      </div>
      {action}
    </div>
  )
}

// ProfilePage — dados do usuário (Nome, E-mail, Usuário, Perfil de acesso — nessa ordem) +
// edição. "Perfil de acesso" só aparece pra administradores (papel é gerido em
// /settings/users, nunca editável aqui — só exibido, e só pra quem já é admin). Montado em 3
// rotas (/profile, /profile/edit, /profile/change-email) — ver ProfileLayout/App.tsx. E-mail
// tem seu próprio fluxo (código de confirmação, enviado ao endereço NOVO), sem botão inline no
// card de visualização — a entrada é só o link "Alterar e-mail" em ProfileLayout; Nome e
// Usuário dividem um "Editar" no rodapé (ambos são campos simples — usuário com checagem de
// duplicidade, igual e-mail; nome sem restrição).
export default function ProfilePage() {
  const location = useLocation()
  const navigate = useNavigate()
  // Edição via rota dedicada (padrão de CameraDetailSettingsPage/UserDetailSettingsPage,
  // ver CLAUDE.md): `editing*` é DERIVADO da URL, nunca useState — navegar entre /profile,
  // /profile/edit e /profile/change-email não remonta o componente (mesmo elemento montado
  // nas 3 rotas), então um useState inicial não sobreviveria a essa troca.
  const editingBasic = location.pathname === '/profile/edit'
  const editingEmail = location.pathname === '/profile/change-email'

  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // Edição de Nome/Usuário.
  const [nameInput, setNameInput] = useState('')
  const [usernameInput, setUsernameInput] = useState('')

  // Troca de e-mail (código de confirmação).
  const [newEmail, setNewEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)

  function loadProfile() {
    fetch('/api/me', { headers: authHeaders() })
      .then((res) => {
        if (res.status === 401) {
          onUnauthorized()
          return null
        }
        return res.ok ? res.json() : null
      })
      .then((data) => {
        if (data) setProfile(data)
      })
  }

  useEffect(loadProfile, [])

  // Reidrata o form de Nome/Usuário a partir de `profile` sempre que entra em modo edição —
  // cobre tanto o clique em "Editar" (profile já carregado) quanto o deep-link direto pra
  // /profile/edit (profile pode chegar DEPOIS da rota já bater). Ajuste durante o RENDER, não
  // um useEffect com setState (react-hooks/set-state-in-effect barra isso) — mesmo padrão
  // "adjusting state when a prop changes" já usado em CameraViewTabs.tsx. Reage a duas
  // transições: `editingBasic` (clique) OU `profile` mudando de referência enquanto já em
  // edição (chegada tardia do fetch).
  const [prevEditingBasic, setPrevEditingBasic] = useState(editingBasic)
  const [syncedProfile, setSyncedProfile] = useState<Profile | null>(null)
  if (editingBasic && profile && (editingBasic !== prevEditingBasic || profile !== syncedProfile)) {
    setNameInput(profile.name ?? '')
    setUsernameInput(profile.username ?? '')
    setSyncedProfile(profile)
  }
  if (editingBasic !== prevEditingBasic) setPrevEditingBasic(editingBasic)

  // Reseta o form de e-mail sempre que entra em modo edição (mesmo padrão render-time acima)
  // — sem isso, um cancelamento no meio do fluxo (código já enviado) deixaria `codeSent`/`code`
  // "vazando" pra próxima vez que o usuário reabrir /profile/change-email (o componente não
  // remonta ao trocar de rota).
  const [prevEditingEmail, setPrevEditingEmail] = useState(editingEmail)
  if (editingEmail !== prevEditingEmail) {
    setPrevEditingEmail(editingEmail)
    if (editingEmail) {
      setNewEmail('')
      setCode('')
      setCodeSent(false)
    }
  }

  function startEditBasic() {
    setError('')
    setMessage('')
    navigate('/profile/edit')
  }

  function cancelEditBasic() {
    setError('')
    navigate('/profile')
  }

  async function handleSaveBasic(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput, username: usernameInput }),
      })
      if (res.status === 401) {
        onUnauthorized()
        return
      }
      if (!res.ok) {
        setError(
          res.status === 409
            ? 'Esse usuário já está em uso.'
            : (await res.text()) || 'Não foi possível salvar.',
        )
        return
      }
      setMessage('Dados atualizados com sucesso.')
      loadProfile()
      navigate('/profile')
    } finally {
      setLoading(false)
    }
  }

  function cancelEditEmail() {
    setError('')
    navigate('/profile')
  }

  async function handleRequestCode(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await fetch('/api/me/email/request-change', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_email: newEmail }),
      })
      if (res.status === 401) {
        onUnauthorized()
        return
      }
      if (!res.ok) {
        setError((await res.text()) || 'Não foi possível enviar o código.')
        return
      }
      setCodeSent(true)
      setMessage(`Código enviado para ${newEmail}.`)
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmCode(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await fetch('/api/me/email/confirm-change', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.status === 401) {
        onUnauthorized()
        return
      }
      if (!res.ok) {
        setError((await res.text()) || 'Código inválido ou expirado.')
        return
      }
      setMessage('E-mail atualizado com sucesso.')
      setCodeSent(false)
      setNewEmail('')
      setCode('')
      loadProfile()
      navigate('/profile')
    } finally {
      setLoading(false)
    }
  }

  const editing = editingBasic || editingEmail

  return (
    <ProfileLayout>
      <div id="profile-details" className="max-w-md space-y-4">
        {profile && !editing && (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <Field label="Nome" value={profile.name || '—'} />
            <Field label="E-mail" value={profile.email || 'nenhum cadastrado'} />
            <Field label="Usuário" value={profile.username} />
            {profile.role === 'admin' && <Field label="Perfil de acesso" value="Administrador" />}
          </div>
        )}

        {!editing && (
          <Button id="profile-edit-basic" type="button" variant="outline" onClick={startEditBasic}>
            Editar
          </Button>
        )}

        {profile && !editing && <TelegramLinkSection />}
        {profile && !editing && <PushSubscriptionSection />}

        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
        {message && <p className="text-success text-sm">{message}</p>}

        {editingBasic && (
          <form onSubmit={handleSaveBasic} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="profile-name" className="mb-1 block text-muted-foreground">
                Nome
              </Label>
              <Input
                id="profile-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="profile-username" className="mb-1 block text-muted-foreground">
                Usuário
              </Label>
              <Input
                id="profile-username"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button id="profile-save-basic" type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
              <Button
                id="profile-cancel-basic"
                type="button"
                variant="outline"
                onClick={cancelEditBasic}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {editingEmail && !codeSent && (
          <form onSubmit={handleRequestCode} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="profile-new-email" className="mb-1 block text-muted-foreground">
                Novo e-mail
              </Label>
              <Input
                id="profile-new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <div className="flex gap-2">
              <Button id="profile-send-code" type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar código
              </Button>
              <Button
                id="profile-cancel-email"
                type="button"
                variant="outline"
                onClick={cancelEditEmail}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {editingEmail && codeSent && (
          <form onSubmit={handleConfirmCode} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="profile-confirm-code" className="mb-1 block text-muted-foreground">
                Código de confirmação
              </Label>
              <Input
                id="profile-confirm-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                inputMode="numeric"
                maxLength={6}
              />
            </div>
            <div className="flex gap-2">
              <Button id="profile-confirm-code-submit" type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
              <Button
                id="profile-cancel-code"
                type="button"
                variant="outline"
                onClick={cancelEditEmail}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>
    </ProfileLayout>
  )
}
