# internal/notifications/application

O canal "dentro da aplicação" — o sino/`NotificationsPage`, único canal que
existia antes do módulo `internal/notifications` ser criado.

## Arquivos principais
- `application.go` — `LivePush interface { Push(userID int64) }` (definida
  aqui, lado consumidor, pra este pacote não depender de `internal/server`)
  e `Sender`/`New(database, push)`: persiste via `db.InsertUserNotification`
  e, se `push != nil`, aciona o push ao vivo. `push` pode ser `nil`
  (nil-safe — só persiste, sem side effect de tempo real; usado pelo
  `storage.Cleaner`, que não tem acesso ao `notifHub`).

## Ver também
- [internal/notifications](../README.md) — `Notification`/`Sender`/`Dispatcher`.
- [internal/db](../../db/README.md) — `InsertUserNotification`/`ListUserNotifications`, a persistência real.
- [internal/server](../../server/README.md) — `Server.Push` satisfaz `LivePush` delegando ao `notifHub` privado.
