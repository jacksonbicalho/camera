# Usuários e perfil

## Arquivos principais

- `pages/settings/UsersSettingsPage.tsx` (`/settings/users`) — lista com
  cada linha em **grid de colunas fixas**
  (`grid-cols-1 sm:grid-cols-[10rem_10rem_5rem_1fr_auto]`: username/nome/
  role/câmeras/ações). **As 5 células são sempre renderizadas**, mesmo
  vazias (`'—'` no nome) — condicionar a presença de uma célula faria os
  itens de grid seguintes ocuparem a coluna errada em linhas com menos
  elementos. Célula "câmeras" mostra `'todas'` pra admin, `'sem câmeras'`/
  nomes pra viewer. A lista de câmeras de um usuário (`user.cameras`,
  `string[]` de IDs) sempre resolve pra NOME via a lista já buscada em
  `GET /api/cameras` (`.find(c => c.id === id)?.name || id`) — mostrar o
  UUID cru era um bug real, presente também em `UserDetailSettingsPage`.
- `components/ProfileLayout.tsx` — ver [shell-layout.md](shell-layout.md).
- `pages/ProfilePage.tsx` — montado em 3 rotas (`/profile`, `/profile/edit`,
  `/profile/change-email`) — ver
  [routing-editing.md](routing-editing.md) pro caso "form montado o tempo
  todo" (padrão `prevKey`/`setKey`).
- `pages/ChangePasswordPage.tsx` — **single-purpose**: só o fluxo forçado de
  1º login (`mustChangePassword()===true`), form solto sem `Layout`/sidebar.
  Fora desse caso, redireciona pra `/`. Trocar a própria senha logado é
  `ProfileChangePasswordPage` (self-service, `/profile/change-password`);
  trocar a senha de OUTRO usuário é o campo "Senha" (opcional — vazio mantém
  a atual) do `UserForm`, na edição em `/settings/users/edit/:id`.
- `components/TelegramLinkSection.tsx` — renderizada em `/profile` (dado
  pessoal do usuário logado — "vincular minha própria conta Telegram", no
  mesmo espírito de "Alterar e-mail"/"Alterar senha", por isso fala com
  `/api/me/*`, não `/api/settings/extensions/telegram`, que é só o toggle
  "Ativado" system-wide, ver [extensions.md](extensions.md)). Lê
  `telegram_active` de `GET /api/me/preferences` (mesmo campo que
  `CameraMotionTelegramNotify` já consome) pra decidir se aparece: só
  renderiza quando a extensão está ativa **ou** o usuário já tinha vinculado
  a conta antes dela ser desativada — nesse segundo caso mostra só
  "Desvincular" (nunca "Vincular"), pra não deixar um `chat_id` órfão no
  banco sem forma de desvincular pela UI (história
  `fix/gate-telegram-link-por-extensao-ativa`). Esse gate é só UX; a garantia
  real é o backend (`handleTelegramLink`, ver
  [internal/server](../go-modules/internal/server/README.md)) devolvendo 503
  quando a extensão está desativada.

- `components/PushSubscriptionSection.tsx` — renderizada em `/profile`, ao
  lado de `TelegramLinkSection` (história
  `feat/web-push-notificacoes-movimento`). Ao contrário do sino (SSE, só
  funciona com a aba viva — ver [notifications.md](notifications.md)), é
  Web Push de verdade: entrega notificação de movimento mesmo com o app
  fechado/em background. Botão único "Ativar notificações push" ⇄
  "Desativar", cujo estado vem de `usePushSubscription`
  (`hooks/usePushSubscription.ts`). A seção inteira **some silenciosamente**
  (retorna `null`) quando `!supported` — não é um "erro" pro usuário
  resolver, é a mesma degradação limpa de qualquer feature condicionada a
  browser API: Web Push exige contexto seguro (HTTPS ou `localhost`), então
  em HTTP puro o botão simplesmente nunca aparece.
- `hooks/usePushSubscription.ts` — `subscribe()`: pede permissão
  (`Notification.requestPermission()`), busca a chave pública VAPID em
  `GET /api/me/push/vapid-public-key`, registra `public/sw.js`
  (`navigator.serviceWorker.register` — **lazy**, só no momento do
  subscribe, não no boot do app: diferente de `useForceReloadOnStaleBuild`,
  que registra/roda desde o mount, aqui o SW só existe depois que o usuário
  efetivamente opta por notificações), assina via
  `registration.pushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey })` e envia a subscription resultante por
  `POST /api/me/push/subscription`. Se o POST falhar (401 ou qualquer status
  não-ok), desfaz a subscription recém-criada no `PushManager`
  (`sub.unsubscribe()`) antes de reportar erro — sem esse rollback, o
  navegador ficaria com uma subscription "fantasma" que o backend nunca
  saberia entregar. `unsubscribe()` faz o inverso: remove do `PushManager`
  primeiro, depois `DELETE /api/me/push/subscription` (assimetria conhecida
  — se o `DELETE` falhar depois do unsubscribe local, o estado React fica
  desatualizado até reload; registrado como follow-up no code review do T4,
  não bloqueante). No mount, `getRegistration('/sw.js')` +
  `pushManager.getSubscription()` reflete se já havia uma subscription
  válida (ex. reload de página) — sem side effect de registrar nada.
  `supported` reflete `'serviceWorker' in navigator && 'PushManager' in
  window && typeof Notification !== 'undefined'`.
- `public/sw.js` — Service Worker mínimo, só dois listeners: `push` (extrai
  `{title, body, link}` do payload JSON e chama
  `self.registration.showNotification`) e `notificationclick` (foca uma aba
  já aberta e navega pro `link`, ou abre uma nova). Deliberadamente **não
  intercepta `fetch`/cache** — o app já resolve staleness de build de outro
  jeito (`useForceReloadOnStaleBuild`, ver
  [docs/frontend/README.md](README.md)); um SW com fetch handler reabriria
  essa discussão sem necessidade.

## Ver também
- [routing-editing.md](routing-editing.md) — padrão de edição via rota, aplicado aqui
- [extensions.md](extensions.md) — toggle "Ativado" da extensão Telegram, `telegram_active`
- [notifications.md](notifications.md) — sino/SSE; por que a notificação do SO passou a ser disparada só pelo Service Worker, não mais pela SSE
- [internal/server](../go-modules/internal/server/README.md) — `handleTelegramLink`/`handleTelegramUnlink`, a validação real de `Active`; `push.go` (`handleGetPushVAPIDPublicKey`/`handleSubscribePush`/`handleUnsubscribePush`)
- [internal/notifications/webpush](../go-modules/internal/notifications/webpush/README.md) — o Sender por trás da entrega real
