import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

// TestNotificationCard — card de teste reutilizado 2x (Telegram/Web Push)
// em PreferencesTestsPage. Mesmo chrome visual de ExtensionCard (ícone com
// halo, nome, descrição, divisor, `fieldset disabled` + opacidade quando
// indisponível) mas com um MOTIVO customizável por instância — ExtensionCard
// tem um texto de tooltip fixo ("esta extensão não está habilitada"), que
// não serve aqui: os dois cards podem estar indisponíveis por razões
// diferentes (Telegram: vínculo/extensão/câmera; Web Push: sem subscription
// salva), e a story pede que o usuário entenda o motivo, não só que o botão
// esteja cinza.
interface Props {
  id: string
  icon: ReactNode
  name: string
  description: string
  available: boolean
  disabledReason: string
  onTest: () => Promise<{ ok: boolean; error?: string }>
}

const FEEDBACK_TIMEOUT_MS = 4000

export default function TestNotificationCard({
  id,
  icon,
  name,
  description,
  available,
  disabledReason,
  onTest,
}: Props) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleTest = async () => {
    setTesting(true)
    setResult(null)
    setErrorMsg('')
    const res = await onTest()
    setTesting(false)
    if (res.ok) {
      setResult('success')
    } else {
      setResult('error')
      setErrorMsg(res.error || 'Falha ao enviar a notificação de teste.')
    }
    setTimeout(() => {
      setResult(null)
      setErrorMsg('')
    }, FEEDBACK_TIMEOUT_MS)
  }

  return (
    <div
      id={id}
      title={available ? undefined : disabledReason}
      className={`bg-surface border border-border rounded-xl p-6 max-w-md${
        available ? '' : ' opacity-40'
      }`}
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="relative shrink-0">
          <div className="absolute inset-0 -m-2 rounded-full bg-primary/20 blur-lg" />
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{name}</p>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
      <div className="border-t border-border my-4" />
      <fieldset disabled={!available || testing} className="border-0 p-0 m-0 min-w-0">
        <Button id={`${id}-button`} variant="default" size="sm" onClick={handleTest}>
          {testing ? 'Testando…' : `Testar ${name}`}
        </Button>
      </fieldset>
      {result === 'success' && (
        <p className="mt-3 text-sm text-success">Notificação de teste enviada!</p>
      )}
      {result === 'error' && <p className="mt-3 text-sm text-danger">{errorMsg}</p>}
    </div>
  )
}
