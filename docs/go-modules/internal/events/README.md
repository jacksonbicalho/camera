# internal/events

Barramento de eventos in-process: qualquer parte do backend publica um
`Event` tipado sem conhecer os assinantes; quem quiser reagir se inscreve
pelo `Type`. Só em memória — sem broker externo, sem persistência (um
evento publicado sem assinante ativo se perde). Existe pra desacoplar
produtor de consumidor: antes dele, "algo aconteceu" → "avisar quem se
importa" era resolvido no próprio call site (ex. `storage.Cleaner`
chamando `notifications.Dispatcher.Notify` direto); agora um produtor só
publica um `Event` e não sabe nem precisa saber quem consome.

## Arquivos principais
- `bus.go` — `Event{Type, CameraID, At, Data}` (`Data` é opaco ao bus, cada
  par produtor/assinante define seu próprio formato) e `Bus`/`NewBus`.
  `Publish` faz fan-out pra todo assinante do mesmo `Type`, sob lock.
  `Subscribe(eventType)` devolve o canal de leitura (bufferizado,
  `subscriberBufferSize = 16`) e uma função `unsubscribe` que fecha o canal
  e remove a entrada do mapa interno (idempotente — chamar duas vezes não
  panica).

## Decisões e invariantes
- `Publish` é **não-bloqueante**: um assinante com o canal cheio (parou de
  ler) simplesmente perde o evento, em vez de travar o produtor — mesmo
  padrão de fan-out já usado em `server/notif_hub.go` (`subscriberBufferSize`
  casa com o buffer de lá). Aceitável pro caso de uso atual (alertas
  operacionais em tempo real); não é um log de auditoria, então nunca
  assuma que todo evento publicado chega a todo assinante.
- Sem histórico/replay: um assinante que se inscreve depois de um `Publish`
  nunca vê aquele evento. Isso importa em quem monta o wiring — ver a nota
  de ordem de boot em [internal/alerts](../alerts/README.md).
- Zero value de `Bus` não é utilizável (`subs` nil) — sempre construa via
  `NewBus()`.

## Ver também
- [internal/alerts](../alerts/README.md) — único assinante hoje, traduz eventos operacionais em notificação.
- [internal/recorder](../recorder/README.md) — publica `recorder.stopped`/`recorder.recovered`.
- [internal/transmission/hls](../transmission/hls/README.md) — publica `transmission.stopped`/`transmission.recovered`.
- [internal/notifications](../notifications/README.md) — o `Dispatcher` que `internal/alerts` aciona depois de consumir um evento.
