# internal/stateengine

Roda a inferência de estado de um classificador: a cada disparo (por
enquanto, um ticker por intervalo), captura um recorte da câmera, chama o
classificador (serviço YOLO), passa pela verificação de N consecutivos
(`stateclass.Tracker`) e, na transição, persiste e emite o novo estado. Tudo
via dependências injetadas (`Grabber`, `analysis.StateClassifier`,
`persist`, `emit`) — testável sem ffmpeg/YOLO reais.

## Arquivos principais
- `runner.go` — `Grabber` (interface: captura um recorte, devolve caminho +
  cleanup) e `Runner`/`NewRunner`. `Step` executa 1 ciclo (grab → classify →
  tracker → persist+emit na transição — o modelo devolve a classe como
  slug, `FriendlyLabel` traduz pro rótulo amigável antes de persistir/emitir;
  falha ao salvar o thumbnail da transição não aborta o ciclo, só fica sem
  thumb). `Run` dispara `Step` a cada `trigger_interval_seconds` (retorna de
  imediato se o intervalo não for positivo — esse classificador só dispara
  por movimento, não por ticker).
- `grabber.go` — `SelectIntervalRunners`: filtra classificadores elegíveis
  (habilitado + intervalo > 0) — usado por `StartRunners` (`snapshot_grabber.go`)
  no boot. `cropNormalized`: recorta a região 0-1 da imagem.
- `snapshot_grabber.go` — `SnapshotGrabber` (implementa `Grabber`): tira o
  snapshot via `SnapFunc` injetado (o mesmo `snapFn` que o server já usa),
  croppa e grava sob `{storagePath}/tmp` — mesmo path que o serviço YOLO lê
  em `/data`, sem tradução. `StartRunners` sobe um `Runner` em goroutine por
  classificador elegível e retorna quantos iniciou.
- `history.go` — `SaveHistoryFrame`: persiste o thumbnail durável de uma
  transição de estado.
- `samples.go` — `ListSamples`/`SaveSamples`/`SaveTrainSet`: dois destinos
  separados de propósito. `SaveSamples` persiste os frames INTEIROS enviados
  pelo form (`state_samples/`, usados pra reidratar a edição). `SaveTrainSet`
  persiste os CROPS já recortados que o form "Salvar e treinar" envia
  (`state_train/`) — separado pra o treino não sobrescrever os frames
  inteiros salvos por `SaveSamples`.
- `trainset.go` — `BuildTrainSetFromSamples`: recorta server-side as
  amostras já persistidas (usado pelos botões "Treinar agora"/"Treinar
  todos", que não reenviam os crops do zero).
- `slug.go` — `Slug`/`FriendlyLabel` (slug ↔ rótulo amigável das classes).
- `migrate.go` — `MigrateSampleDirsToSlug` (idempotente, roda no boot):
  renomeia pastas de classe antigas com espaços/acentos pro formato slug.

## Ver também
- [internal/stateclass](../stateclass/README.md) — `Classifier`/`Tracker`, os tipos de domínio consumidos aqui.
- [internal/analysis](../analysis/README.md) — `StateClassifier`/`ClassifyRequest`, o cliente do serviço YOLO.
- [internal/db](../db/README.md) — persistência de `camera_state_history` via `persist`.
