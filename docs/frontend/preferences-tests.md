# Testes (Preferências)

`/settings/preferences/tests` é a seção "Testes" em Preferências — permite
verificar se os canais de notificação de movimento (Telegram, Web Push)
realmente entregam, sem precisar esperar um evento de movimento real ou
rodar um script ad-hoc no servidor. Chegou depois de `extensions.md`
(história `feat/preferencias-testes-notificacao`) e reusa o mesmo chrome
visual dos cards de extensão, mas resolvidos por gates diferentes.

## Arquivos principais

- `pages/settings/PreferencesTestsPage.tsx` — busca `GET
  /api/me/preferences` (mesmo padrão ad-hoc de `TelegramLinkSection`/
  `CameraMotionTelegramNotify` — não existe hook compartilhado de
  preferences no projeto) e deriva a disponibilidade de cada card:
  `telegramAvailable = telegram_linked && telegram_active &&
  telegram_motion_notify_enabled`; `pushAvailable = push_subscribed`. Um
  erro de rede no fetch deixa os flags em `null` pra sempre (fail-safe:
  nunca habilita um card por engano, mas também não distingue "gate não
  passa" de "falha ao carregar" — aceito, ver review da história).
- `components/TestNotificationCard.tsx` — card reutilizado 2x (Telegram e
  Web Push): mesmo chrome de `ExtensionCard` (ver
  [extensions.md](extensions.md)) — ícone com halo, nome, descrição,
  divisor, `fieldset disabled` — mas com um `disabledReason` **customizável
  por instância** em vez do tooltip fixo de `ExtensionCard`, já que os dois
  cards ficam indisponíveis por motivos diferentes (Telegram: vínculo +
  extensão + câmera; Web Push: sem subscription salva) e a UI precisa
  explicar qual. Controla feedback pós-clique local (`testing`/`result`/
  `errorMsg`), some depois de `FEEDBACK_TIMEOUT_MS` (4s) — mesmo padrão de
  `CameraMotionTelegramNotify.tsx`.
- `lib/sendTestNotification.ts` — POST compartilhado pelos 2 cards; lê o
  corpo `text/plain` da resposta de erro (convenção do projeto, `http.Error`
  no backend — nunca um envelope JSON) e trata 401 via `onUnauthorized`.

## Decisões e invariantes

- **`TestNotificationCard` duplica ~20 linhas de JSX de `ExtensionCard` de
  propósito** (registrado no code review como follow-up, não bloqueante):
  `ExtensionCard` tem um texto de tooltip fixo, e um único `disabledReason`
  compartilhado não serviria pros dois cards aqui. Se um 3º card do mesmo
  tipo aparecer, vale a regra dos três — `ExtensionCard` ganhar um
  `disabledReason` opcional em vez de manter dois componentes quase
  idênticos.
- **Os 3 gates do card Telegram são resolvidos pelo backend, não
  recalculados no frontend** — `telegram_linked`/`telegram_active`/
  `telegram_motion_notify_enabled` já vêm prontos de `GET
  /api/me/preferences` (ver
  [docs/go-modules/internal/server/README.md](../go-modules/internal/server/README.md),
  `telegramGateStatus`). O clique em "Testar" ainda rechecha tudo de novo
  no servidor (`POST /api/me/telegram/test`) — o gate no frontend é só UX,
  nunca a garantia real, mesmo padrão já estabelecido pro vínculo de conta
  Telegram (`users-profile.md`).
- **Card desabilitado nunca esconde o botão** — mesma decisão de
  `ExtensionCard` (`available=false` → `opacity-40` + tooltip), reaplicada
  aqui via `disabledReason`: mais informativo que sumir com o card.

## Ver também
- [extensions.md](extensions.md) — `ExtensionCard`, chrome visual de origem
- [shell-layout.md](shell-layout.md) — `PreferencesLayout`, link "Testes" no submenu
- [users-profile.md](users-profile.md) — vínculo de conta Telegram e ativação de push, pré-requisitos dos dois gates aqui
- [notifications.md](notifications.md) — sino/SSE, canal distinto dos testados aqui
