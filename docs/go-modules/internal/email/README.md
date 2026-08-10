# internal/email

Envio de e-mail transacional (hoje: recuperação de senha; genérico o
bastante pra outros usos — é o `mailer` por trás do sender `email` de
[internal/notifications](../notifications/README.md)).

## Arquivos principais
- `email.go` — `Sender` (interface `Send(to, subject, body) error` — pequena
  o bastante pra ficar no mesmo pacote da implementação concreta) e
  `SMTPSender`/`NewSMTPSender(config.SMTPConfig)` sobre `net/smtp` (stdlib,
  sem dependência nova). `Send` resolve `FromName`/`FromEmail` em tempo de
  envio (default `"os-camera"`/`Username`, não em `config.Load`) e monta a
  mensagem RFC 5322 crua. `sendMail` é um seam sobre `smtp.SendMail`
  (`StubSendMail` troca por um fake nos testes, sem SMTP real).

## Ver também
- [internal/config](../config/README.md) — `SMTPConfig`.
- [internal/notifications/email](../notifications/email/README.md) — usa este `Sender` (via uma interface local, sem import direto) como canal de notificação.
- [internal/server](../server/README.md) — `WithEmailSender`, usado hoje por `POST /api/auth/forgot-password`.
