# docs/frontend

Documentação por área do frontend (`frontend/src/`) do os-camera — SPA
React/Vite/Tailwind embutida no binário Go via `go:embed`. Mesmo papel que
`docs/go-modules/` tem pro backend: **esta árvore é a fonte de verdade**
sobre comportamento e decisões de cada área — o `CLAUDE.md` só referencia o
arquivo correspondente quando precisa do assunto, nunca duplica o conteúdo.

Mantida pelo subagent `docs-writer` (`.claude/agents/docs-writer.md`),
invocado automaticamente ao final de cada história — ver `docs/workflow.md`.

## Modelo de documentação

Todo arquivo aqui (e em `docs/go-modules/**/README.md`) segue a mesma forma:

```markdown
# <Nome da área>

<1-2 parágrafos: o que é, responsabilidade, papel no sistema>

## Arquivos principais
- `Componente.tsx` — o que faz e por quê (só o que não é óbvio lendo o código)

## Decisões e invariantes
- Cada item é uma regra que sobrevive ao código: uma escolha cogitada e
  descartada, um gotcha não-óbvio, uma restrição externa (browser/lib/
  hardware) que molda o design. Cite a história (`tipo/slug`) só quando
  ajuda a entender O PORQUÊ — não é preciso documentar toda reversão
  histórica, só a que ainda é carga viva pra quem for mexer aqui de novo.

## Ver também
- [outra-área](outra-area.md) — como se relacionam
```

**Prosa é arquitetura, não changelog.** O objetivo é o estado atual + o
"porquê" que ainda importa — não uma crônica de cada história que já tocou
o arquivo. Se uma decisão foi tentada, revertida e a lição não muda mais
nenhuma escolha futura, comprima ou omita; se ela ainda evita que alguém
repita o mesmo erro, mantenha, mas em 1-2 frases, não um parágrafo.

## Índice

### Fundamentos
- [routing-editing.md](routing-editing.md) — padrão de edição via rota dedicada, convenção de `id` único, rotas de câmera "seção antes do id"
- [design-system.md](design-system.md) — tokens/tema, modo de cor, accent, exceção MUI, `Switch`/`ApplyButton` compartilhados

### Shell e navegação
- [shell-layout.md](shell-layout.md) — `Sidebar`, `TopBar`, `Layout`, `PageHeader`, `SettingsLayout`, `CameraSettingsTabs`, `PreferencesLayout`, `ProfileLayout`, largura do conteúdo (`.page-content`)

### Player e páginas de vídeo
- [player.md](player.md) — `Player`, `PlayerFooter`, `VideoPlayer`, `Zoom`, `RecordingPlayerModal`, `CameraStageHeader`/`CameraViewTabs`
- [pages.md](pages.md) — `LivePage`, `HistoryPage`, `VideoBrowserPage`, `RecordingsPage`, `ReportsPage`, `LiveViewPage`

### Configurações (`/settings/*`)
- [camera-settings.md](camera-settings.md) — `CameraForm`, seções sempre-editáveis de câmera, `CameraDetailSettingsPage`, `CamerasSettingsPage`
- [extensions.md](extensions.md) — `PreferencesExtensionsPage`, `ExtensionCard`/`ExtensionActiveToggle` (chrome compartilhado), `TelegramExtensionCard`, `S3ExtensionCard`
- [preferences-tests.md](preferences-tests.md) — `PreferencesTestsPage`, `TestNotificationCard` (testes de notificação Telegram/Web Push)
- [users-profile.md](users-profile.md) — `UsersSettingsPage`, `ProfileLayout`, `ChangePasswordPage`
- [about-updates.md](about-updates.md) — `AboutPage`, `UpdateAlertRow`, `UpdateProgressModal`

### Notificações
- [notifications.md](notifications.md) — `NotificationContext`, `MotionNotificationsBell`

## Hooks e componentes compartilhados (sem doc própria — self-explanatory)

`useEventSource(path, onMessage, options?)` — abre um `EventSource`
autenticado via `?token=` e chama `onMessage` a cada evento; `path = null`
fecha sem abrir. `options.onOpen`/`options.onError` (opcionais,
retrocompatíveis) repassam os handlers nativos do `EventSource` — usados
por `UpdateProgressModal` (ver [about-updates.md](about-updates.md)) pra
detectar queda/retomada de conexão; todo outro chamador continua só com
`path`/`onMessage`. `useStats()` — busca `/api/stats` com polling de 30s.
`useSettings()` / `useAbout()` — buscam `/api/settings` e `/api/about`.

`useForceReloadOnStaleBuild()` (`hooks/useForceReloadOnStaleBuild.ts`,
montado uma vez em `App.tsx`) — resolve um PWA reaberto do ícone da tela
inicial que só retoma uma aba suspensa pelo SO sem requisição de rede nova
(o JS antigo continua rodando na memória mesmo com bundles JS/CSS já imunes
a cache obsoleto via hash de conteúdo do Vite). No mount, guarda o `commit`
do primeiro `GET /api/about` bem-sucedido como baseline em memória; a cada
`document.visibilitychange` que torna a página visível, refaz o fetch e
compara — divergiu do baseline (servidor já rodou build mais novo) →
`window.location.reload()`. Fail-open: 401 (sessão expirada) ou erro de
rede não recarrega e não sobrescreve um baseline já estabelecido. Depende de
`internal/server` (`spaHandler`, ver
[docs/go-modules/internal/server/README.md](../go-modules/internal/server/README.md))
setar `Cache-Control: no-cache` no `index.html`, senão o reload podia servir
HTML em cache no meio do caminho e não resolver nada.

`SettingsSection` (card com lista de campos label/valor), `ConfirmDialog`
(modal fixo de confirmação pra ações destrutivas; prop `danger` alterna
botão vermelho/azul), `MotionScoreChart` (gráfico SVG em tempo real dos
scores brutos via SSE, escala logarítmica, janela de 30s; teto do eixo Y
dinâmico via `computeLogMax` — ver [camera-settings.md](camera-settings.md)).
