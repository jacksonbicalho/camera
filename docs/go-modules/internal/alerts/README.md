# internal/alerts

Único assinante dos eventos operacionais publicados em
[internal/events](../events/README.md) (recorder/transmissão parados ou
recuperados, resultado de uma atualização aplicada) — traduz cada um numa
`notifications.Notification` entregue a todo usuário `admin` via
`notifications.Dispatcher`. Reaproveita 100% do `Dispatcher` existente:
antes só `storage.Cleaner` e `server.NotifyUpdateAvailable` chamavam
`Notify` direto, cada um resolvendo "quem avisar" com sua própria lógica de
listar admins.

## Arquivos principais
- `alerts.go` — `Subscribe(ctx, bus, database, dispatcher, log)`: assina os 6
  tipos de evento (`recorder.EventStopped`/`EventRecovered`,
  `hls.EventStopped`/`EventRecovered`, `server.EventUpdateApplied`/
  `EventUpdateFailed`), cada um numa goroutine própria que
  roda até `ctx.Done()` (desinscreve e retorna). Cada evento recebido resolve
  todos os `db.ListUsers` com `Role == "admin"` e chama
  `dispatcher.Notify` com título/mensagem fixos por tipo (`specs`,
  `CameraID` do evento entra na mensagem quando o tipo tem um — os dois
  eventos de update não são por câmera, `message` simplesmente ignora o
  argumento). Sem usuários admin, ou erro ao listar, não notifica (loga o
  erro e segue).

## Decisões e invariantes
- **Importa `internal/server` só pelas consts de tipo de evento**
  (`server.EventUpdateApplied`/`EventUpdateFailed`), mesmo padrão já usado
  pra `recorder`/`hls`. Confirmado sem ciclo: nem `server` nem
  `recorder`/`hls` importam `alerts` — quem liga as duas pontas é sempre
  `cmd/camera/main.go`.
- Os eventos de update não carregam `CameraID` (não são por câmera,
  diferente de `recorder`/`hls`) — `message` ignora o argumento. Mesmo
  padrão de `notifType` dos demais (`"success"` pra `EventUpdateApplied`,
  `"warning"` pra `EventUpdateFailed`, espelhando `EventRecovered`/
  `EventStopped`). Existem pra fechar o incidente de `POST /api/updates/apply` de
  ponta a ponta (ver [internal/server](../server/README.md)): mesmo depois
  do recheck fresco eliminar a causa raiz (checksum stale), um `Apply()`
  ainda pode falhar por outro motivo (rede, disco cheio) — sem esse
  evento, isso só ia pro log e a tela do admin ficava presa em
  "Atualizando…" sem nenhum aviso.
- Listar admins duplica a lógica já existente em
  `storage/cleaner.go:notifyDiskHigh` **de propósito** — só 2 usos no
  projeto até aqui, não atinge a regra de três que justificaria extrair um
  helper compartilhado.
- **Ordem de boot em `cmd/camera/main.go`:** o `events.Bus` é construído e
  injetado nos `Recorder`/`HLSStreamer` de cada câmera (`startCameraProcs`)
  antes de `alerts.Subscribe` ser chamado (que só roda depois que
  `dispatcher`/`database` existem). Como o `Bus` não bufferiza histórico
  (ver [internal/events](../events/README.md)), um `EventStopped`/
  `EventRecovered` publicado nessa janela de boot é perdido. Na prática o
  impacto é pequeno: `Recorder.Run`/`HLSStreamer.Run` republicam
  `EventStopped` a cada tentativa de reconexão falha (sem dedupe pela flag
  local `stopped`), e o intervalo de reconexão padrão é de poucos segundos
  — então um admin tipicamente recebe o alerta poucos segundos depois do
  boot, só a primeiríssima tentativa pode se perder. Se a confiabilidade do
  primeiro evento pós-boot virar requisito, é preciso inverter a ordem
  (`alerts.Subscribe` antes de `startCameraProcs`) ou bufferizar o último
  evento por tipo no `Bus`.

## Ver também
- [internal/events](../events/README.md) — o barramento que este pacote assina.
- [internal/notifications](../notifications/README.md) — o `Dispatcher` acionado aqui.
- [internal/recorder](../recorder/README.md) — produtor de `recorder.stopped`/`recorder.recovered`.
- [internal/transmission/hls](../transmission/hls/README.md) — produtor de `transmission.stopped`/`transmission.recovered`.
- [internal/server](../server/README.md) — produtor de `update.applied`/`update.failed` (`handleApplyUpdate`, `POST /api/updates/apply`).
- [internal/storage](../storage/README.md) — outro call site do `Dispatcher`, com sua própria lógica de resolver admins.
