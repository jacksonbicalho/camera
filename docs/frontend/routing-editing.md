# Rotas e edição

Convenções de roteamento que valem pro app inteiro (dentro ou fora de
`/settings`), não escolhas caso-a-caso por página.

## Edição via rota dedicada

Toda página com um modo de edição usa uma rota própria pra ele — nunca
`useState` local nem `state` de navegação, que se perdem em reload/deep-link/
botão voltar do navegador (decisão explícita do navigator, história
`feat/storage-view-edit-toggle`). Convenção de nome: `.../edit` pra config
única (`/settings/preferences/storage/edit`, `/profile/edit`) ou
`.../edit/:id` pra entidade (`/settings/cameras/edit/:id`,
`/settings/users/edit/:id`). `editing` é sempre **derivado**, nunca guardado
em estado — `useLocation().pathname === '<rota-de-edição>'` (ou
`.startsWith(...)` quando a rota tem `:id`); "Editar" chama
`navigate('<rota-de-edição>')`; salvar (sucesso) e cancelar chamam
`navigate('<rota-de-visualização>')`.

Como a navegação entre visualização/edição NÃO remonta o componente (mesmo
elemento lazy montado em mais de uma rota), o form precisa lidar com isso.
Dois casos:

1. **Mount/unmount condicional** (`editing ? <Form/> : <Visualização/>`, o
   caso comum) — o form nasce do zero (`useState(() => initFromProps(...))`)
   toda vez que entra em edição, sem esforço extra. Exemplos: `CameraForm`,
   `UserForm`, `StorageSettingsPage`.
2. **Form que fica montado o tempo todo**, alternando de conteúdo pela
   sub-rota sem desmontar o pai (`ProfilePage`, entre `/profile/edit` e
   `/profile/change-email`) — precisa reidratar/resetar estado manualmente
   ao entrar em edição. Como `setState` direto dentro de `useEffect` é
   barrado pelo eslint (`react-hooks/set-state-in-effect`), isso é feito com
   o padrão "adjusting state during render" (`prevKey`/`setKey`, mesmo já
   usado em `CameraViewTabs.tsx`), nunca um `useEffect` — ver `ProfilePage.tsx`
   pro exemplo completo, incluindo o caso do deep-link onde os dados ainda
   não chegaram do fetch no momento em que a rota já bate.

Implementações: `/settings/users/edit/:id` (`UserDetailSettingsPage`),
`/settings/preferences/storage/edit` (`StorageSettingsPage`), `/profile/edit`
+ `/profile/change-email` (`ProfilePage`, 2 rotas de edição independentes no
mesmo componente).

**Carve-out**: `/settings/cameras/:id` (`CameraDetailSettingsPage`) seguia
esse padrão até a história `refactor/camera-detail-secoes-aplicar`, quando o
navigator pediu (com screenshot) que a página parasse de alternar entre
visualização/edição — virou **sempre-editável, seção por seção**, cada uma
com seu próprio "Aplicar" (ver [camera-settings.md](camera-settings.md)). A
rota de edição foi removida.

## `id` único e estável

Todo componente/elemento da UI deve ter um `id` único e estável. Botões,
painéis, itens de navegação, abas, o ponteiro da timeline etc. recebem um
`id` descritivo (ex: `sidebar-settings`, `events-panel`, `timeline-pointer`,
`theme-mode-dark`). Facilita testes, automação e referência inequívoca em
revisões — ao criar ou alterar um elemento, garanta o `id`.

## Rotas de câmera: seção antes do id

Rotas de settings por câmera seguem o padrão **seção antes do id**
(`/settings/cameras/<seção>/:id`): `/settings/cameras/:id` (detalhes —
sempre editável pro admin, sem rota de edição própria — ver acima),
`/settings/cameras/zones/:id` (zonas de exclusão). Motion e Analysis por
câmera deixaram de ter rota própria e viraram sessões dentro de
`/settings/cameras/:id` (ver [camera-settings.md](camera-settings.md)). As
rotas de API do backend mantêm o id antes do recurso (`/api/cameras/:id/motion/zones`
etc.) — só as rotas do frontend usam seção-antes-do-id.

## Ver também
- [design-system.md](design-system.md) — tokens de tema usados por todo componente
- [shell-layout.md](shell-layout.md) — `Sidebar`/`SettingsLayout`/`PreferencesLayout`
- [camera-settings.md](camera-settings.md) — o carve-out sempre-editável de câmera
