# internal/db

Acesso ao SQLite (`modernc.org/sqlite`, driver puro Go — sem cgo). Executa
migrations em `internal/db/migrations/` na inicialização (ver
[db/migrations](migrations/README.md)). Cada arquivo do pacote agrupa os
accessors de um domínio (`cameras.go`, `users.go`, `recordings.go`,
`motion_events.go`, `drives.go`, `state_classifiers.go`, `trainers.go`,
`detectors.go`, `device_info.go`, `zones.go`, `analysis.go`,
`content_days.go`, `annotations.go`, `reports.go`, `config.go`, `logging.go`,
`emailchange.go`, `passwordreset.go`, `theme.go`, `notifications.go`,
`seed.go`).

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
[internal/deviceinfo](../deviceinfo/README.md)),
`camera_state_classifiers`/`camera_state_classes`/`camera_state_history`
(state classification — tipos em `internal/stateclass`, accessors em
`state_classifiers.go`, todas FK ON DELETE CASCADE; `notify_enabled`/
`footer_enabled` gateiam por classificador se a transição vira notificação/
aparece no rodapé; `history_retention_minutes` nullable — override por
classificador da retenção efetiva, herda `storage.state_history_minutes`
quando `NULL`).

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
  `SetUserCameras`/`UserHasCamera`).
- `notification:<id>` (JSON `{type,title,message,link,created_at,read_at}`) +
  `notification_seq` (contador por usuário, em tx) — a persistência por trás
  do sender `application` de [internal/notifications](../notifications/README.md)
  (`InsertUserNotification`/`ListUserNotifications`/etc., `notifications.go`).
- `password_reset` (`"<token>:<expiry-unix>"`) — recuperação de senha
  efêmera (`passwordreset.go`).
- `state_notify:{cid}`/`state_footer:{cid}` = `"1"` por linha — destinatários
  de canal por classificador (`state_classifiers.go`), consumidos por
  `internal/server`'s `resolveStateNotifyRecipients` antes de despachar via
  `internal/notifications`.

## Migrations
**Nunca use `;` em comentários de migration** — `splitSQL` (`db.go`) divide
naïvemente o script em `;` e quebra o parse.

## Ver também
- [internal/db/migrations](migrations/README.md) — os arquivos `.sql` em si.
- [internal/notifications/application](../notifications/application/README.md) — consome `InsertUserNotification`/`ListUserNotifications`.
- [internal/deviceinfo](../deviceinfo/README.md), [internal/stateclass](../stateclass/README.md) — donos conceituais das tabelas EAV/state.
