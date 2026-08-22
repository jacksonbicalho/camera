# Shell e navegação

O shell de página (`TopBar` + `Sidebar` + conteúdo) que toda página do app
usa, e as camadas de navegação de `/settings/*`.

## Arquivos principais

- `components/Layout.tsx` — shell de página: `TopBar` em cima (full-width,
  `sticky top-0`) + uma linha `Sidebar` + conteúdo + `Footer` (rodapé
  estático, "os-camera · monitoramento residencial", sem versão/uptime/
  stats). `Sidebar` fica num wrapper `sticky top-14 h-[calc(100vh-3.5rem)]`
  — gruda logo abaixo da `TopBar` e cobre o resto da altura da viewport.
  `TopBar`/`Sidebar` só renderizam quando `hideNav` é falso (ex.: player em
  tela cheia esconde os dois). Toda página do app usa esse shell.
- `components/TopBar.tsx` — barra fixa full-width, altura `h-14`. Logo
  "os-camera" (id `logo-app`, link pra `/`) à esquerda; à direita, o grupo
  `AppHelpMenu` → `ThemeModeNav` (id do gatilho `color-mode`) →
  `MotionNotificationsBell` (id `motion-notifications`, ver
  [notifications.md](notifications.md)) → `UserMenu` (id `logged-in-user`,
  renderiza EM FLUXO, não `position: fixed`). O meio fica vazio de
  propósito, reservado pra elementos futuros. `AppHelpMenu`
  (`components/AppHelpMenu.tsx`, id do gatilho `app-help`) reusa o hook
  `useFlyout` (`sidebarFlyout.ts`) e tem um único sub-link: "Sobre" (id
  `about-application`, → `/settings/about`).
- `components/Sidebar.tsx` — rail de navegação único do app. Recolhido por
  padrão (só ícones, `w-14`), expande (`w-48`, com labels) — preferência
  persiste em `localStorage` (`ui-display-mode`). Seções sempre visíveis e
  empilhadas (`SidebarSection` — cabeçalho uppercase `font-bold`/`text-muted`
  + separador `border-t` acima, mais espaço ACIMA do título que abaixo,
  lei da proximidade); **sem** flyout/accordion atrás de um ícone
  "Configurações". Rail começa pelo botão "Recolher menu" (ícone hambúrguer
  `Menu`, alterna `ui-display-mode`).
- `components/PageHeader.tsx` — cabeçalho padronizado (título + subtítulo
  opcional + ações à direita); prop `size` (`page`, default, ou `section` —
  usada nas sub-páginas de `/settings/cameras/*`, que já têm o breadcrumb do
  `CameraSettingsTabs` como contexto).
- `components/SettingsLayout.tsx` — envoltório fino pra **todas** as páginas
  de `/settings/*`: só `Layout` + `.page-content`, `id`/`footerId`
  repassados por prop — **sem** coluna de navegação própria (o rail já
  mostra a hierarquia completa; uma 2ª coluna idêntica seria redundância).
- `components/CameraSettingsTabs.tsx` — só as abas Câmera/Zonas no topo das
  páginas de configuração por câmera (`/settings/cameras/<seção>/:id`).
- `components/PreferencesLayout.tsx` — submenu LATERAL de Preferências: só 3
  links fixos e estáticos — Extensões (`/settings/preferences/extensions`),
  Aparência (`/settings/preferences/appearance`), Armazenamento
  (`/settings/preferences/storage`) — sem fetch, sem agrupamento, sem
  sub-navegação por extensão. Prop `active` destaca o item atual via
  `aria-current="page"`. Renderizado DENTRO do `SettingsLayout`/`PageHeader`
  de cada página-filha, não um wrapper que os substitui.
- `components/ProfileLayout.tsx` — layout do Perfil (chegada via
  `UserMenu`): coluna com 3 links (Perfil / Alterar e-mail / Alterar senha)
  sobre o `Layout`, sem lista de seções administrativas.

## Sidebar: seções e itens (estado atual)

De cima pra baixo: 1ª seção sem cabeçalho visível (só "Ao vivo", `end: true`,
aponta pra `/`); `Câmeras e Gravações` (Câmeras, Gravações `/recordings`,
Histórico `/history`, Relatórios `/reports` — **todos os itens visíveis pra
qualquer role**, sem gate `isAdmin`); `Administração` (admin: Servidor,
Rastrear câmeras, Usuários, Preferências —
`/settings/preferences/extensions`, ponto de entrada único pra
Extensões/Aparência/Armazenamento).

A seção `Inteligência` (Análise de vídeo, Rotular eventos, Detectores de
objetos, Treinadores) foi removida por inteiro junto com toda a
funcionalidade de análise/detecção de objetos (história
`chore/remover-analise-objetos`), que também removeu a capacidade
equivalente do backend Go e o serviço YOLO — mesmo padrão da remoção
anterior do item "Estados" (classificação de estado por câmera,
`chore/remover-classificacao-estados-frontend`, 1ª de 3 histórias
sequenciais que também removeram a capacidade do backend Go e os próprios
endpoints do serviço YOLO). Nenhuma das duas funcionalidades existe mais em
nenhuma camada. `SidebarNavLink`/`NavItemDef` não têm mais o campo
`matchHash` — existia só pra diferenciar Análise de vídeo/Rotular eventos,
que compartilhavam pathname com hash diferente; sem esses itens, todo
`isActive` volta a usar o comportamento nativo do `NavLink`.

Os 3 itens de Gravações/Histórico/Relatórios já foram admin-only
(`{isAdmin && (...)}`); o gate foi removido porque escondia páginas cujo
backend já filtrava corretamente os dados por câmera concedida (viewer sem
acesso nenhuma câmera só via listas vazias, mesmo comportamento que
"Câmeras" já tinha). Não reintroduzir o gate sem que o backend também
regrida — os dois andam juntos.

## Largura do conteúdo (`.page-content`)

Classe compartilhada `.page-content` (`styles/base.css`, `width: 100%` —
**fluida, sem `max-width`**) — fonte única da largura padrão, garante a
MESMA largura em toda página. `<Layout contentClassName="p-6">` (margem de
página) + `<div className="page-content space-y-4">` como wrapper do
conteúdo — toda página segue esse padrão em vez de repetir `max-w-*` na mão.

**Decisão deliberada, não default acidental**: já existiu um cap
(`max-w-[80rem]`) pensado pra páginas de player único (evitar vídeo
`aspect-video` gigante em telas largas). Foi removido a pedido explícito do
navigator ("o conteúdo seja fluido") — decisão nova que substitui a
rationale antiga. Não reintroduzir um cap sem pedido explícito.

`HistoryPage` era a última exceção (2ª coluna de gravações grande o
bastante pra merecer um layout próprio) — fechada, hoje segue o mesmo
padrão de largura fluida. Detalhes do layout de duas colunas de
`HistoryPage` (incluindo o algoritmo de altura do sidebar de gravações,
`ResizeObserver` via ref callback) vivem em [player.md](player.md), por
estarem acoplados ao `VideoPlayer`.

## Ver também
- [player.md](player.md) — `HistoryPage`'s duas colunas e o rodapé do player
- [pages.md](pages.md) — páginas que consomem este shell
- [design-system.md](design-system.md) — tokens usados aqui
- [notifications.md](notifications.md) — `MotionNotificationsBell` na `TopBar`
