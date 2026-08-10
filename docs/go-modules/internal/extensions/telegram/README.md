# internal/extensions/telegram

Cliente mínimo da Bot API do Telegram. Pacote **autocontido** — não depende
de `internal/db`/`internal/notifications` e não é invocado por
`cmd/camera/main.go` nesta história: o admin já consegue ver e ligar a
extensão em `Preferências > Extensões`, mas ligar não dispara nada ainda
(sem listener de `/start`, sem vínculo de `chat_id`, sem envio real de
notificação — fica para uma história futura).

## Arquivos principais
- `client.go` — `Client` (`NewClient(botToken string)`), com
  `SendMessage(chatID, text string) error` (`POST .../sendMessage`) e
  `GetMe() (username string, err error)` (`GET .../getMe`). A URL base da
  API é um seam (`apiBaseURL`, com `StubAPIBase` exportado pros testes) —
  mesmo idioma do `sendMail` de `internal/email`.

## Ver também
- [internal/extensions](../README.md) — visão geral do domínio.
- [internal/email](../../email/README.md) — mesmo idioma de seam de
  testes (`sendMail`/`StubSendMail`), aplicado aqui como
  `apiBaseURL`/`StubAPIBase`.
