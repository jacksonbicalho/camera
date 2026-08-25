# internal/notifications

Único ponto da aplicação que sabe **como entregar** uma notificação — quem
sabe **para quem** (resolução de destinatários) continua sendo o chamador.
Os 2 call sites reais hoje resolvem pra "todos os admins", mas cada um faz
essa resolução por si (nenhum utilitário compartilhado) — um chamador
futuro pode resolver por canal configurável/acesso à câmera sem precisar
mudar este pacote.

## Arquivos principais
- `dispatch.go` — tipo `Notification{UserIDs, Type, Title, Message, Link}`,
  interface `Sender` (`Send(n Notification, userID int64) error` — cada
  implementação decide por si se se aplica àquele usuário específico) e
  `Dispatcher`/`NewDispatcher(log, senders...)`/`Notify` (fan-out por
  destinatário × sender; erro de um sender não impede os demais, nem para o
  mesmo destinatário nem para os seguintes).

Um sender por subpacote, **sem registry global nem `init()`** (diferente de
um padrão de plugin auto-registrado) — os senders são construídos
explicitamente em `main.go` e passados pro `Dispatcher`.

## Subpacotes
- [application](application/README.md) — o canal que já existia antes deste módulo (persistência + push ao vivo).
- [email](email/README.md) — opt-in por usuário, sobre [internal/email](../email/README.md).
- `telegram` (sem doc própria ainda) — canal por chat_id vinculado, opt-in explícito por câmera (`db.ListCameraMotionTelegramNotifyPrefs`).
- [webpush](webpush/README.md) — Web Push real (Service Worker + Push API), único canal que entrega com o app fechado; sem opt-in por câmera (a permissão do navegador já é o opt-in).

`telegram` e `webpush` são os dois canais DEDICADOS de
`Server.NotifyCameraMotion` (ver [internal/server](../server/README.md)) —
nunca passam pelo `Dispatcher` genérico acima, que despacharia também pro
sino sempre-ativo (`application`). Cada um resolve destinatários por si e
falha independentemente do outro.

## Call sites migrados
`NotifyUpdateAvailable` (update disponível, em
[internal/server](../server/README.md)) e `storage.Cleaner.notifyDiskHigh`
(disco cheio, ver [internal/storage](../storage/README.md)). Nenhum dos 2
chama `db.InsertUserNotification` diretamente mais — uma 3ª origem futura
deve chamar `Dispatcher.Notify`, nunca o insert direto.

## Ver também
- [internal/db](../db/README.md) — `user_settings` (persistência por trás do sender `application` e das preferências).
- [internal/server](../server/README.md) — injeta o `Dispatcher` (`WithNotifications`) e implementa `LivePush` (`Server.Push`).
