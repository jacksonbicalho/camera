# Notificações (bell)

Notificações de movimento em tempo real, distintas de notificações via
Telegram (ver [extensions.md](extensions.md), que é entrega assíncrona
externa) e de Web Push (ver [users-profile.md](users-profile.md),
`PushSubscriptionSection`/`usePushSubscription`) — este arquivo é sobre o
sino da `TopBar` e a lista/contagem de não-lidas que ele mostra.

## Arquivos principais

- `contexts/NotificationContext.tsx` — contexto global que abre um
  `EventSource` por câmera (via `GET /api/cameras/{id}/motion/live`) e
  acumula notificações de movimento em `localStorage` (máx. 100). Expõe:
  `notifications`, `unreadCount`, `markRead`, `markAllRead`,
  `markSelectedRead`, `markAllUnread`, `remove`, `removeAll`,
  `removeSelected`.
- `components/MotionNotificationsBell.tsx` — sino na `TopBar` (id
  `motion-notifications`, ver [shell-layout.md](shell-layout.md)); abre
  painel com lista, seleção múltipla, marcar lido/excluir; clique num item
  resolve e navega pra gravação via `lib/eventNavigation.resolveEventRecordingUrl`.

## Decisões e invariantes
- **A SSE alimenta só a lista/contagem do sino — não dispara mais a
  notificação do SO.** Até `feat/web-push-notificacoes-movimento`, o
  handler da SSE em `NotificationContext.tsx` também chamava
  `useBrowserNotifications().notify(...)` a cada evento, disparando um
  `new Notification(...)` direto da página (só funciona com a aba viva).
  Isso foi removido: quem tem Web Push ativo (Service Worker,
  `public/sw.js`) já recebe a notificação do SO por esse canal, inclusive
  com o app fechado; manter os dois duplicaria a notificação pra quem tem
  as duas coisas ativas. Ver [users-profile.md](users-profile.md) pro fluxo
  de Web Push completo.
- **`useBrowserNotifications`/o toggle "notificações do navegador" no sino
  continuam na UI, mas ficam sem efeito prático** — eram o único chamador
  de `notify()`, removido acima. Remoção completa (toggle + hook) foi
  deixada fora do escopo de `feat/web-push-notificacoes-movimento`;
  registrado como follow-up, não como bug (a UI não quebra, só não faz mais
  nada quando ativada).

## Ver também
- [shell-layout.md](shell-layout.md) — posição do sino na `TopBar`
- [extensions.md](extensions.md) — canal Telegram (entrega externa, config separada)
- [users-profile.md](users-profile.md) — `PushSubscriptionSection`/`usePushSubscription`, a Web Push real que substituiu o disparo direto via SSE
