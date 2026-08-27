# internal/notifications/webpush

O canal de Web Push real (Service Worker + Push API) — o único que entrega
uma notificação de movimento com o app fechado/em background, diferente do
sino em tempo real (SSE, exige a aba viva) ou de um `new Notification(...)`
disparado direto pela página. Mirrors `internal/notifications/telegram` na
forma (`Sender`/`New`, envio injetado pra testar sem rede real).

## Arquivos principais
- `vapid.go` — `GetOrCreateVAPIDKeys(db) (public, private string, err error)`:
  lê o par de chaves de `system_config` (`push.vapid_public_key`/
  `push.vapid_private_key`); se ausente, gera via
  `webpushgo.GenerateVAPIDKeys()` e persiste. Chamadas subsequentes sempre
  devolvem o mesmo par.
- `webpush.go` — `sendFunc` (assinatura de `webpushgo.SendNotification`,
  injetada — `Sender` testável sem round-trip real com o serviço de push) e
  `Sender`/`New(db, vapidPublic, vapidPrivate, send)`. `Send(n, userID)`
  lista TODAS as subscriptions do usuário (`db.ListPushSubscriptionsForUser`
  — um usuário pode ter várias, uma por dispositivo) e envia o mesmo payload
  JSON (`{title, body, link}`) pra cada uma; uma subscription que o serviço
  de push responde 404/410 é removida (`db.DeletePushSubscriptionByEndpoint`)
  — o navegador nunca mais vai aceitar entregas nesse endpoint depois disso.
  `send` pode ser `nil` (chaves VAPID indisponíveis) — `Send` vira no-op
  silencioso, mesmo padrão de `telegram.Sender`.

## Decisões e invariantes
- **Chaves VAPID são estáveis entre reinícios, ao contrário do segredo
  JWT.** Uma subscription do navegador fica atrelada à chave pública usada
  no momento de `PushManager.subscribe()` — trocar a chave invalidaria toda
  subscription já registrada, forçando todo usuário a reativar manualmente.
  Por isso `GetOrCreateVAPIDKeys` persiste em `system_config` em vez de
  gerar a cada boot.
- **Sem opt-in por câmera, ao contrário do Telegram.** O Telegram exige
  vínculo explícito de conta + preferência por câmera
  (`db.ListCameraMotionTelegramNotifyPrefs`); Web Push não tem tabela de
  preferência equivalente — a permissão de notificação concedida pelo
  navegador ao assinar (`internal/server/push.go`,
  `PushSubscriptionSection`/`usePushSubscription` no frontend) já É o
  opt-in. Quem resolve os destinatários por câmera é o chamador
  (`Server.webpushMotionRecipients`, ver
  [internal/server](../../server/README.md)), não este pacote.
- **Mensagem em texto plano, nunca HTML.** O corpo chega verbatim no popup
  de notificação do SO (via `self.registration.showNotification` no Service
  Worker) — diferente do Telegram, que renderiza `parse_mode=HTML`. Nunca
  reusar a mesma string formatada para os dois canais.
- **`TTL` sempre 3600 (1h), nunca omitido.** `webpushgo.Options` sem `TTL`
  explícito vira `TTL: 0` no header HTTP — pelo RFC 8030 isso instrui o
  serviço de push a só entregar se o dispositivo estiver conectado NAQUELE
  INSTANTE, descartando a notificação sem fila/retry (e sem erro: o serviço
  ainda responde `2xx`) sempre que o dispositivo está momentaneamente
  offline (tela apagada, Doze mode, blip de rede) — o que na prática anula
  o propósito do canal descrito acima. 1h é fixo, sem configuração externa:
  tempo de sobra pra reconectar sem deixar o alerta de movimento obsoleto
  se entregue tarde.

## Ver também
- [internal/notifications](../README.md) — `Notification`/`Sender`/`Dispatcher`; por que este canal é DEDICADO (`Server.webpushSender`) e nunca passa pelo `Dispatcher` genérico.
- [internal/db](../../db/README.md) — tabela `push_subscriptions`, `system_config` (par de chaves VAPID).
- [internal/server](../../server/README.md) — `handleGetPushVAPIDPublicKey`/`handleSubscribePush`/`handleUnsubscribePush` (`push.go`), wiring em `NotifyCameraMotion`.
