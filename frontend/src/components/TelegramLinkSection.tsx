import { useEffect, useState } from 'react'
import { authHeaders, onUnauthorized } from '../auth'
import { Button } from '@/components/ui/button'
import { TelegramIcon } from '@/components/TelegramIcon'
import ExtensionCard from '@/components/ExtensionCard'

// TelegramLinkSection — vínculo da conta Telegram do usuário logado
// (história feat/telegram-vinculo-conta, T4). Preferência PESSOAL (mesmo
// espírito de "Alterar e-mail"/"Alterar senha" em ProfilePage), não uma
// config de instância — por isso lê/grava via /api/me/*, não
// /api/settings/extensions/telegram (esse é só o toggle "Ativado"
// system-wide, ver TelegramExtensionCard). Não checa se a extensão está
// "disponível" antes de mostrar "Vincular" — GET /api/settings/extensions
// é authAdmin (um viewer não pode chamá-lo) e não existe hoje um endpoint
// equivalente não-admin; em vez de gatear a visibilidade, um POST /link
// que falhar (extensão indisponível) surfaça o erro (`error`/role=alert)
// em vez de falhar em silêncio.
//
// Vincular: POST /api/me/telegram/link gera um código de uso único e
// devolve a URL do deep-link (t.me/<bot>?start=<código>) — abrir essa URL
// faz o app do Telegram mandar "/start <código>" pro bot automaticamente;
// o poller (T3, backend) resolve o código de volta pra este usuário e
// persiste o chat_id. Esta página não sabe QUANDO isso acontece (não há
// polling/websocket aqui) — o usuário recarrega a página (ou navega de
// volta) depois de vincular no Telegram pra ver o estado atualizado.

// telegramDisplayName picks the best available label for the linked
// Telegram account: "First (@username)" > "First" > "@username" >
// generic fallback — first_name/username can each independently be empty
// (Telegram allows accounts without a public @handle; a link made before
// T2 captured this data has neither).
function telegramDisplayName(firstName: string, username: string): string {
  if (firstName && username) return `${firstName} (@${username})`
  if (firstName) return firstName
  if (username) return `@${username}`
  return 'Conta vinculada'
}

export default function TelegramLinkSection() {
  const [linked, setLinked] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [linking, setLinking] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [error, setError] = useState('')
  const [pendingUrl, setPendingUrl] = useState('')
  const [telegramUsername, setTelegramUsername] = useState('')
  const [telegramFirstName, setTelegramFirstName] = useState('')
  const [telegramBotUsername, setTelegramBotUsername] = useState('')

  useEffect(() => {
    fetch('/api/me/preferences', { headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          onUnauthorized()
          return null
        }
        return r.ok ? r.json() : null
      })
      .then(
        (
          prefs: {
            telegram_linked?: boolean
            telegram_username?: string
            telegram_first_name?: string
            telegram_bot_username?: string
          } | null,
        ) => {
          if (!prefs) return
          setLinked(prefs.telegram_linked ?? false)
          setTelegramUsername(prefs.telegram_username ?? '')
          setTelegramFirstName(prefs.telegram_first_name ?? '')
          setTelegramBotUsername(prefs.telegram_bot_username ?? '')
        },
      )
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  function handleLink() {
    setLinking(true)
    setError('')
    setPendingUrl('')
    // Abre a aba SINCRONAMENTE, dentro do próprio clique — bloqueadores de
    // pop-up (Safari em particular) exigem isso pra não bloquear; a URL
    // real só chega depois, da rede, e é aplicada a essa mesma aba já
    // aberta pelo gesto do usuário (win.location).
    const win = window.open('', '_blank')
    fetch('/api/me/telegram/link', { method: 'POST', headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          onUnauthorized()
          return null
        }
        if (!r.ok) throw new Error('failed')
        return r.json()
      })
      .then((body: { url?: string } | null) => {
        if (!body?.url) return
        if (win) {
          win.location.href = body.url
        } else {
          // Bloqueada mesmo assim — deixa um link visível como alternativa manual.
          setPendingUrl(body.url)
        }
      })
      .catch(() => {
        win?.close()
        setError('Não foi possível gerar o link — a extensão Telegram pode estar indisponível.')
      })
      .finally(() => setLinking(false))
  }

  function handleUnlink() {
    setUnlinking(true)
    setError('')
    fetch('/api/me/telegram/unlink', { method: 'POST', headers: authHeaders() })
      .then((r) => {
        if (r.status === 401) {
          onUnauthorized()
          return
        }
        if (!r.ok) throw new Error('failed')
        setLinked(false)
      })
      .catch(() => setError('Não foi possível desvincular — tente novamente.'))
      .finally(() => setUnlinking(false))
  }

  if (!loaded) return null

  return (
    <ExtensionCard
      id="telegram-link-section"
      icon={<TelegramIcon className="relative h-16 w-16" />}
      name="Telegram"
      description={
        linked
          ? 'Sua conta está vinculada — você pode receber notificações por aqui.'
          : 'Vincule sua conta pra poder receber notificações via Telegram.'
      }
      available
    >
      {linked ? (
        <>
          <p className="text-sm text-foreground mb-2">
            {/* span isolado — getByText não casa texto quebrado por um <a> irmão dentro do mesmo <p> */}
            <span>{telegramDisplayName(telegramFirstName, telegramUsername)}</span>
            {telegramBotUsername && (
              <>
                {' · '}
                <a
                  href={`https://t.me/${telegramBotUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Abrir chat
                </a>
              </>
            )}
          </p>
          <Button id="telegram-unlink" onClick={handleUnlink} disabled={unlinking}>
            {unlinking ? 'Desvinculando...' : 'Desvincular'}
          </Button>
        </>
      ) : (
        <Button id="telegram-link" onClick={handleLink} disabled={linking}>
          {linking ? 'Abrindo...' : 'Vincular'}
        </Button>
      )}
      {pendingUrl && (
        <p className="text-xs mt-2">
          Seu navegador bloqueou a nova aba —{' '}
          <a href={pendingUrl} target="_blank" rel="noreferrer" className="underline">
            clique aqui pra abrir o Telegram
          </a>
          .
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger text-xs mt-2">
          {error}
        </p>
      )}
    </ExtensionCard>
  )
}
