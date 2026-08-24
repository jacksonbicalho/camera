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

## Ver também
- [routing-editing.md](routing-editing.md) — padrão de edição via rota, aplicado aqui
- [extensions.md](extensions.md) — toggle "Ativado" da extensão Telegram, `telegram_active`
- [internal/server](../go-modules/internal/server/README.md) — `handleTelegramLink`/`handleTelegramUnlink`, a validação real de `Active`
