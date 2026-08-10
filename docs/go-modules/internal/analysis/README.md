# internal/analysis

Cliente HTTP do serviço YOLO (`services/yolo/`, Python/FastAPI) — os tipos de
requisição/resposta e o `Client` são compartilhados pelas 3 capacidades que o
serviço expõe. Não decide QUANDO chamar (isso é `internal/storage`,
`internal/detector`, `internal/stateengine`) — só COMO chamar.

## Arquivos principais
- `analysis.go` — três grupos de símbolos, um por capacidade do serviço:
  - **Detecção de objetos**: `Detection`/`AnalyzeRequest`/`AnalyzeResponse`,
    interface `Analyzer` (o que `internal/storage` precisa — testável via
    `FakeAnalyzer`, usada em `cleaner_test.go`), `Client.Analyze` (`POST
    /analyze`). `internal/detector` NÃO usa a interface `Analyzer` — seu
    adapter `yolo.go` chama `Client.Analyze` direto, como tipo concreto.
    `ErrServiceBusy` (`503`) sinaliza GPU ocupada (treino ou outra
    inferência) — chamadores devem tratar como "tenta depois", nunca falha
    permanente.
  - **State classification**: `ClassPrediction`/`ClassifyRequest`, interface
    `StateClassifier` (o que `internal/stateengine.Runner` precisa),
    `Client.Classify` (`POST /classify`) e `Client.ClassifyTrain` (`POST
    /classify/train`).
  - **Fine-tuning de object detection**: `AnnotationItem`/`FinetuneRequest`/
    `FinetuneStatus`, `Client.Finetune`/`FinetuneStatus`/`CancelFinetune`
    (`POST/GET/DELETE /finetune*`).
  - `FakeAnalyzer` — implementação fake de `Analyzer` pra testes sem serviço
    YOLO real.

## Ver também
- [internal/detector](../detector/README.md) — consome `Client.Analyze`/`Detection` (tipo concreto, não a interface `Analyzer`).
- [internal/trainer](../trainer/README.md) — consome `FinetuneRequest`/`FinetuneStatus`.
- [internal/stateengine](../stateengine/README.md) — consome `StateClassifier`/`ClassifyRequest`.
