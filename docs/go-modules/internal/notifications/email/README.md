# internal/notifications/email

O canal por e-mail — opt-in por usuário, sobre o `internal/email.Sender` já
existente (até este módulo, usado só por "esqueci minha senha").

## Arquivos principais
- `email.go` — `mailer interface { Send(to, subject, body string) error }`
  (definida aqui, lado consumidor, satisfeita estruturalmente por
  `*email.SMTPSender` sem import direto de `internal/email`) e
  `Sender`/`New(database, mailer)`: só envia quando o usuário optou
  (`notify:email_enabled` em `user_settings`, ver
  [internal/db](../../db/README.md)) e tem um e-mail cadastrado — formata
  Título/Mensagem em Assunto/Corpo. `mailer` pode ser `nil` (SMTP não
  configurado) — `Send` vira no-op silencioso, mesmo padrão de opt-out.

## Ver também
- [internal/notifications](../README.md) — `Notification`/`Sender`/`Dispatcher`.
- [internal/email](../../email/README.md) — `Sender`/`SMTPSender`, o `mailer` real por trás deste canal.
- [internal/db](../../db/README.md) — `notify:email_enabled`, `GetUserEmail`.
