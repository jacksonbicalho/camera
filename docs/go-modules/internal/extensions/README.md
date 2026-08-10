# internal/extensions

Domínio de integrações opcionais ("extensões"), configuráveis pelo admin em
`Preferências > Extensões` (`/settings/preferences/extensions`). Não tem
`.go` próprio — só agrupa os subpacotes abaixo, um por extensão. Cada
extensão tem sua própria config aninhada em `config.ExtensionsConfig`
(`internal/config`); a presença do campo obrigatório dela (ex.:
`Telegram.BotToken`) é o que determina se a extensão está "disponível" —
mesmo idioma de `SMTPConfig.Host` para o e-mail.

Ativar/desativar uma extensão (`extensions.<nome>.enabled` em
`system_config`, `internal/db/extensions.go`) é uma config de **instância**
(admin-only), não por-usuário — `GET/PUT /api/settings/extensions`.

## Subpacotes
- [telegram](telegram/README.md) — cliente da Bot API do Telegram.

## Ver também
- [internal/config](../config/README.md) — `ExtensionsConfig`.
- [internal/db](../db/README.md) — `system_config`, o mesmo KV genérico de
  instância usado por `storage.*`/`analysis.state_trainer_id`.
