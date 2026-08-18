# internal/analysis

Cliente HTTP do serviço YOLO (`services/yolo/`, Python/FastAPI) — os tipos de
requisição/resposta e o `Client` são compartilhados pelas 2 capacidades que o
serviço expõe hoje pro app Go. Não decide QUANDO chamar (isso é
`internal/storage`, `internal/detector`) — só COMO chamar.

## Arquivos principais
- `analysis.go` — dois grupos de símbolos, um por capacidade do serviço:
  - **Detecção de objetos**: `Detection`/`AnalyzeRequest`/`AnalyzeResponse`,
    interface `Analyzer` (o que `internal/storage` precisa — testável via
    `FakeAnalyzer`, usada em `cleaner_test.go`), `Client.Analyze` (`POST
    /analyze`). `internal/detector` NÃO usa a interface `Analyzer` — seu
    adapter `yolo.go` chama `Client.Analyze` direto, como tipo concreto.
    `ErrServiceBusy` (`503`) sinaliza GPU ocupada (treino ou outra
    inferência) — chamadores devem tratar como "tenta depois", nunca falha
    permanente.
  - **Fine-tuning de object detection**: `AnnotationItem`/`FinetuneRequest`/
    `FinetuneStatus`, `Client.Finetune`/`FinetuneStatus`/`CancelFinetune`
    (`POST/GET/DELETE /finetune*`).
  - `FakeAnalyzer` — implementação fake de `Analyzer` pra testes sem serviço
    YOLO real.

O serviço YOLO ainda expõe `/classify*` (classificação de estado), mas
nenhum código Go chama mais esses endpoints — a capacidade foi removida do
app (`chore/remover-classificacao-estados-backend`); o serviço em si sai
numa história futura dedicada.

## Ver também
- [internal/detector](../detector/README.md) — consome `Client.Analyze`/`Detection` (tipo concreto, não a interface `Analyzer`).
- [internal/trainer](../trainer/README.md) — consome `FinetuneRequest`/`FinetuneStatus`.
