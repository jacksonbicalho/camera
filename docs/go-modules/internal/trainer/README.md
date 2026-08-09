# internal/trainer

Despacha jobs de fine-tuning de object detection pra um adapter de backend
plugável, escolhido por um discriminador `trainers.type` — mesma forma de
`internal/detector`, mas com 3 métodos (`Train`/`Status`/`Cancel`) em vez de
1, já que treino é um job assíncrono start→poll→cancel, não uma chamada
única. Reaproveita `analysis.FinetuneRequest`/`FinetuneStatus` (não inventa
tipos paralelos).

Escopo deliberadamente restrito a fine-tuning de object detection — o treino
de state classifiers ([internal/stateengine](../stateengine/README.md),
dataset por classificador) é estruturalmente diferente (não produz 1 modelo
global) e fica de fora.

## Arquivos principais
- `trainer.go` — `Trainer` (interface `Train`/`Status`/`Cancel`) e
  `New(trainerType, config)` — hoje só `"yolo"` (`""` tratado como
  `"yolo"`, mesma convenção de compatibilidade do `internal/detector`).

## Subpacotes
- [adapters](adapters/README.md) — `Yolo`, o único backend hoje.

## Cadastro e uso (wiring do lado servidor)
Cadastro próprio (tabela `trainers`/`trainer_config`, EAV, `type` já nasce na
criação) via `internal/server/trainers.go`
(`GET/POST /api/settings/trainers`, `PUT/DELETE /api/settings/trainers/{id}`,
admin). `internal/server/finetune.go` resolve o trainer cadastrado via
`trainer_id` (obrigatório no body/query dos endpoints de fine-tuning) —
detalhe completo de rotas/frontend fica no doc de
[internal/server](../server/README.md). A classificação de estado usa um
ponteiro separado (`analysis.state_trainer_id` em `system_config`, resolvido
por `GetStateClassificationServiceURL`) pra um trainer já cadastrado, em vez
de duplicar o mecanismo — ver [internal/stateengine](../stateengine/README.md).

## Ver também
- [internal/detector](../detector/README.md) — mesma forma (backend plugável por discriminador), pra inferência em vez de treino.
- [internal/analysis](../analysis/README.md) — `FinetuneRequest`/`FinetuneStatus`, reaproveitados sem tipos paralelos.
