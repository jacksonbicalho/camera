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

## Ver também
- [routing-editing.md](routing-editing.md) — padrão de edição via rota, aplicado aqui
