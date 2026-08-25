# internal/db

Acesso ao SQLite (`modernc.org/sqlite`, driver puro Go — sem cgo). Executa
migrations em `internal/db/migrations/` na inicialização (ver
[db/migrations](migrations/README.md)). Cada arquivo do pacote agrupa os
accessors de um domínio (`cameras.go`, `users.go`, `recordings.go`,
`motion_events.go`, `drives.go`, `device_info.go`, `zones.go`,
`content_days.go`, `reports.go`, `config.go`, `logging.go`,
`emailchange.go`, `passwordreset.go`, `theme.go`, `notifications.go`,
`push_subscriptions.go`, `seed.go`).

## Tabelas principais
`cameras` (inclui as configs de gravação/motion básicas como colunas
próprias — não há uma tabela `camera_recording_config` separada),
`camera_motion` (config de detecção de movimento por câmera),
`camera_motion_zones`, `users` (com `must_change_password`; **sem** coluna
`email` — e-mail/nome vivem em `user_settings`), `system_config` (config
global chave-valor — não existe uma tabela `settings` solta), `recordings`,
`motion_events`, `drives`, `retention_config`,
`camera_device_info` (EAV: `(camera_id, key, value, collected_at)`, PK
`(camera_id, key)`; `SaveDeviceInfo` faz delete+insert numa tx — cada
captura é um snapshot completo; FK `cameras` ON DELETE CASCADE — ver
[internal/deviceinfo](../deviceinfo/README.md)).

## `user_settings` — KV genérico central por usuário
`(user_id, key, value)`, PK `(user_id, key)`, FK `users` ON DELETE CASCADE.
Concentra o que antes eram tabelas/colunas dedicadas — todos os pares
get/set abaixo são wrappers finos sobre `getUserSetting`/`setUserSetting`
(privados, `theme.go`):
- `theme`/`accent`/`notify:email_enabled` — preferências de UI/notificação
  (`GetUserTheme`/`SetUserTheme`/`GetUserAccentColor`/`SetUserAccentColor`/
  `GetUserNotifyEmail`/`SetUserNotifyEmail`, `theme.go`).
- `email`/`name` — identidade (`GetUserEmail`/`SetUserEmail`/`GetUserName`/
  `SetUserName`, `users.go`; `SetUserEmail` recusa duplicata checando se
  outro `user_id` já usa o mesmo `value`, já que `user_settings` só tem
  constraint nativa sobre `(user_id, key)`; `GetUserByLogin` aceita username
  OU e-mail no mesmo campo).
- `camera:<id>` = `"1"` — acesso de viewer por câmera (`GetUserCameras`/
  `SetUserCameras`/`UserHasCamera`). Sem FK pra `cameras(id)` — a chave é
  texto composto por convenção (`"camera:"+id`), não uma coluna dedicada, e
  SQLite não declara FK sobre substring de outra coluna. Por isso
  `DeleteCamera` (`cameras.go`) não pode confiar em `ON DELETE CASCADE`: ele
  mesmo abre uma transação e roda `DELETE FROM cameras` + `DELETE FROM
  user_settings WHERE key=?` (sem filtro de `user_id` — a concessão de
  QUALQUER usuário que tinha aquela câmera vira órfã igual) antes de
  commitar. Concessões que já ficaram órfãs de deleções anteriores a esse
  fix foram limpas uma vez pela migration `0052_cleanup_orphaned_camera_grants.sql`
  (`DELETE ... WHERE key LIKE 'camera:%' AND substr(key,8) NOT IN (SELECT id
  FROM cameras)`) — retroativa e idempotente, mas não substitui o cleanup em
  `DeleteCamera`: sem ele, toda deleção nova voltaria a acumular órfãos.
- `notification:<id>` (JSON `{type,title,message,link,created_at,read_at}`) +
  `notification_seq` (contador por usuário, em tx) — a persistência por trás
  do sender `application` de [internal/notifications](../notifications/README.md)
  (`InsertUserNotification`/`ListUserNotifications`/etc., `notifications.go`).
- `password_reset` (`"<token>:<expiry-unix>"`) — recuperação de senha
  efêmera (`passwordreset.go`).

## `push_subscriptions` — assinaturas de Web Push
`(id, user_id, endpoint UNIQUE, p256dh, auth, created_at)`, FK `users` ON
DELETE CASCADE (`push_subscriptions.go`). Um usuário pode ter várias linhas
(uma por dispositivo/navegador assinado). `UpsertPushSubscription` faz
`INSERT ... ON CONFLICT(endpoint) DO UPDATE` — assinar de novo a partir do
mesmo dispositivo atualiza as chaves em vez de duplicar. Duas rotas de
remoção com escopo diferente, de propósito: `DeletePushSubscriptionByEndpoint`
(sem checar dono — usada só pela limpeza server-side quando o serviço de
push confirma 404/410 pra aquele endpoint, ver
[internal/notifications/webpush](../notifications/webpush/README.md)) vs.
`DeletePushSubscriptionForUser` (escopada por `user_id` — usada pelo
endpoint HTTP de unsubscribe, pra um usuário não conseguir remover a
subscription de outro só reusando o endpoint). Consumida por
[internal/notifications/webpush](../notifications/webpush/README.md) e por
`internal/server/push.go`.

## Migrations
**Nunca use `;` em comentários de migration** — `splitSQL` (`db.go`) divide
naïvemente o script em `;` e quebra o parse.

## Ver também
- [internal/db/migrations](migrations/README.md) — os arquivos `.sql` em si.
- [internal/notifications/application](../notifications/application/README.md) — consome `InsertUserNotification`/`ListUserNotifications`.
- [internal/notifications/webpush](../notifications/webpush/README.md) — consome `push_subscriptions`.
- [internal/deviceinfo](../deviceinfo/README.md) — dono conceitual da tabela EAV `camera_device_info`.
