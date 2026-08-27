# Sobre e atualização

Página **Preferências > Sobre** (`AboutPage.tsx`, rota `/settings/about`):
mostra informações estáticas do servidor (versão, commit, uptime, Go), o
alerta de atualização disponível (admin only) e as notas de release da
versão instalada. É o único lugar do frontend que fala com
`GET /api/about`, `GET /api/updates`, `POST /api/updates/apply` e
`GET /api/updates/apply/live`.

## Arquivos principais

- `pages/settings/AboutPage.tsx` — a página. `UpdateAlertRow` é a última
  linha do card "Informações do servidor" (renderizada como `children` de
  `SettingsSection`, que já aceitava esse slot) — só existe quando
  `status.update_available` é true e o usuário é admin; sem update ou fora
  do papel admin, não renderiza nada.
- `components/UpdateProgressModal.tsx` — modal bloqueante que assina o SSE
  de progresso do apply e mostra uma linha por step recebido.
- `hooks/useUpdates.ts` — busca `GET /api/updates` e expõe `applyUpdate()`
  (dispara `POST /api/updates/apply`, que só inicia o processo em
  background e responde `202` na hora — o progresso de fato vem do SSE que
  o modal assina, não da resposta desse POST).

## Decisões e invariantes

- **Alerta é linha do card, não seção própria.** Antes (`UpdatesSection`)
  era uma seção separada abaixo do card, com o changelog sempre expandido e
  o botão abaixo dele. Pedido do navigator: o resumo + botão "Atualizar
  agora" ficam na mesma linha (`data-update-row`) dentro de "Informações do
  servidor", e o changelog (`ReleaseNotesMarkdown`) fica atrás de um
  disclosure colapsado por padrão (estado local, sem persistência). Quando
  não há `status.notes_md`, o resumo não é clicável (não faz sentido expandir
  nada) — só vira `<button>` de disclosure quando há changelog pra mostrar.
- **Clicar em "Atualizar agora" abre um modal com progresso real, não um
  texto estático.** Antes, `onApply` só trocava um parágrafo por
  "Atualizando… o servidor vai reiniciar em instantes." e ficava assim até
  o usuário recarregar a página manualmente — sem indicação de erro real
  (o backend logava, mas a UI nunca refletia isso). Agora `onApply` dispara
  o `POST /api/updates/apply` e, se aceito, abre `UpdateProgressModal`
  (`open`/`onDone`), que assume o resto do fluxo.
- **`UpdateProgressModal` é bloqueante e modela o estado como union type por
  fase** (`connecting`/`progress`/`reconnecting`/`success`/`error`), não
  booleans soltos — evita estado impossível (ex. "erro" e "sucesso" ao
  mesmo tempo). Só fecha (botão "Fechar" aparece) num estado terminal
  (`success`/`error`); enquanto isso é focado (`dialogRef.current?.focus()`)
  e portalado direto pra `document.body` (mesmo padrão de `ConfirmDialog`;
  `z-10000`, acima dos flyouts da `Sidebar` que usam `9999`).
- **A queda de conexão do reexec é o próprio sinal de sucesso, não um
  erro.** No self-replace, o processo antigo mata a própria conexão HTTP
  de propósito ao re-executar (step `restarting`, ver
  [internal/updater](../go-modules/internal/updater/README.md)). O
  `EventSource` do navegador reconecta sozinho por padrão; quando `onopen`
  dispara de novo é porque o processo novo já está respondendo. Mas um
  `onerror` **antes** do step `restarting` chegar é uma queda de conexão de
  verdade (rede, proxy, token expirado) — promovê-lo a "reconectando" sem
  essa distinção teria dois riscos: falso-sucesso se o `EventSource`
  reconectasse sozinho sem nunca ter havido update de fato, ou travamento
  permanente se o navegador não tentasse reconectar (o único jeito de sair
  do modal é chegando a um estado terminal). Por isso `sawRestartingRef`
  (um `ref`, não `state` — só lido dentro dos handlers do `EventSource`,
  nunca precisa disparar render) gateia o `onError`: só vira `reconnecting`
  se o step `restarting` já tiver chegado via `onMessage`; senão vira
  `error` direto e terminal. Um `EventUpdateFailed` explícito (ex. checksum
  inválido, processo antigo continua de pé pra reportar) chega como
  mensagem SSE normal e também vira `error` direto, nunca passa pelo fluxo
  de reconexão.
- **`onOpen`/`onError` em `useEventSource`** (`hooks/useEventSource.ts`) são
  parâmetros opcionais adicionados só pra este modal — retrocompatíveis,
  todo outro chamador (`MotionScoreChart`, sino) continua passando só
  `path`/`onMessage`. `onOpen` dispara em toda conexão bem-sucedida,
  inclusive numa reconexão automática do navegador após `onerror` — é
  assim que o modal detecta "servidor voltou a responder".

## Ver também

- [docs/go-modules/internal/server/README.md](../go-modules/internal/server/README.md) — `handleUpdateApplyLive`, `EventUpdateStep`, e por que o recheck de versão no clique é síncrono.
- [docs/go-modules/internal/updater/README.md](../go-modules/internal/updater/README.md) — `Applier.OnStep`, as 4 fases do self-replace.
- [docs/updates.md](../updates.md) — guia de usuário sobre como a checagem/aplicação de atualização funciona.
- [shell-layout.md](shell-layout.md) — `PreferencesLayout`, onde "Sobre" vive na navegação lateral.
