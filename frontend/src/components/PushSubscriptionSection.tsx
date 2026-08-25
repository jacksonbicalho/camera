import { usePushSubscription } from '@/hooks/usePushSubscription'
import { Button } from '@/components/ui/button'

// PushSubscriptionSection — vínculo de notificações push do usuário logado
// (história feat/web-push-notificacoes-movimento), em `/profile` ao lado de
// TelegramLinkSection. Ao contrário do sino (SSE, só funciona com a aba
// viva — ver NotificationContext.tsx), isso é Web Push de verdade: entrega
// mesmo com o app fechado. Não usa ExtensionCard (esse é o chrome de
// "extensões" configuráveis em Preferências, um conceito diferente — push
// não tem config de instância, só o consentimento do próprio navegador).
// `supported` fica false silenciosamente em contexto inseguro (HTTP puro)
// — Web Push exige HTTPS/localhost sem exceção; a seção inteira some nesse
// caso, sem mensagem de erro (não é um "problema" pro usuário resolver).
export default function PushSubscriptionSection() {
  const { supported, subscribed, loading, error, subscribe, unsubscribe } = usePushSubscription()

  if (!supported) return null

  return (
    <div
      id="push-subscription-section"
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <div>
        <p className="text-body font-medium text-foreground">Notificações push</p>
        <p className="text-caption text-muted">
          {subscribed
            ? 'Você receberá notificações de movimento neste dispositivo, mesmo com o app fechado.'
            : 'Ative pra receber notificações de movimento neste dispositivo, mesmo com o app fechado.'}
        </p>
      </div>
      {subscribed ? (
        <Button id="push-unsubscribe" variant="outline" onClick={unsubscribe} disabled={loading}>
          {loading ? 'Desativando...' : 'Desativar'}
        </Button>
      ) : (
        <Button id="push-subscribe" onClick={subscribe} disabled={loading}>
          {loading ? 'Ativando...' : 'Ativar notificações push'}
        </Button>
      )}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
