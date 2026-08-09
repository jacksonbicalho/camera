# internal/detector

Despacha inferência de detecção de objetos pra um adapter de backend
plugável, escolhido por um discriminador `object_detectors.type`
(`"yolo"`/`"huggingface"`) — assim o fluxo de cadastro/teste/análise por
câmera (`internal/server/detectors.go`, `internal/storage/cleaner.go`) não
precisa saber com qual backend um detector cadastrado de fato fala.

## Arquivos principais
- `detector.go` — `Detector` (interface: `Detect(ctx, path,
  confidenceThreshold) ([]analysis.Detection, error)` — o limiar vem do
  chamador, nunca fica guardado no detector) e `New(detectorType, config)`
  (switch explícito, sem registry/`init()`; `""` tratado como `"yolo"` por
  compatibilidade com detectores cadastrados antes da coluna `type`
  existir).

## Subpacotes
- [adapters](adapters/README.md) — `Yolo` e `HuggingFace`, os dois backends hoje.

## Ver também
- [internal/analysis](../analysis/README.md) — `Client.Analyze`/`Detection` (tipo concreto — os adapters não usam a interface `Analyzer`, essa é consumida só por `internal/storage`).
- [internal/trainer](../trainer/README.md) — mesma forma (backend plugável por discriminador), pro treino em vez da inferência.
- [internal/storage](../storage/README.md) — dispara a análise automática de novas gravações.
