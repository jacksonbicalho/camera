# Notificações (bell)

Notificações de movimento em tempo real, distintas de notificações via
Telegram (ver [extensions.md](extensions.md), que é entrega assíncrona
externa — este arquivo é sobre o sino da `TopBar`).

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

## Ver também
- [shell-layout.md](shell-layout.md) — posição do sino na `TopBar`
- [extensions.md](extensions.md) — canal Telegram (entrega externa, config separada)
