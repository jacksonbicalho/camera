# internal/trainer/adapters

O único backend de treino hoje.

## Arquivos principais
- `yolo.go` — `Yolo`/`NewYolo(serviceURL)`: casca fina sobre
  `analysis.Client.Finetune`/`FinetuneStatus`/`CancelFinetune`.

## Ver também
- [internal/trainer](../README.md) — a interface `Trainer` e o discriminador `New(trainerType, config)`.
- [internal/analysis](../../analysis/README.md) — `Client`/`FinetuneRequest`/`FinetuneStatus`.
