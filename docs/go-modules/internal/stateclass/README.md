# internal/stateclass

Tipos de domínio da classificação de estado (state classification): a
configuração de um classificador por câmera e o motor de confirmação de
estado. Fica num pacote próprio (como `internal/zones`) pra que tanto
`internal/db` quanto `internal/stateengine` o usem sem dependência circular.

## Arquivos principais
- `stateclass.go` — `Classifier` (recorte normalizado 0-1, classes possíveis,
  gatilho — movimento e/ou intervalo —, limiar; campos de
  notificação/rodapé: `NotifyEnabled`/`FooterEnabled`/`NotifyUserIDs`/
  `FooterUserIDs`, e `HistoryRetentionMinutes` — override nullable da
  retenção global), `ModelName()` (`custom-cls-<id>` — um modelo por
  classificador, nunca compartilhado, senão os estados se misturariam),
  `Validate()` (mensagens de erro em pt-BR, voltadas ao usuário).
- `tracker.go` — `Tracker`/`NewTracker(threshold, minConsecutive)`:
  confirma um estado só após N leituras iguais consecutivas com
  probabilidade ≥ limiar (leituras abaixo do limiar são ignoradas, não
  contam nem zeram a sequência); `Observe` só retorna `changed=true` na
  transição de fato — é o que evita "piscar" entre estados.

## Ver também
- [internal/stateengine](../stateengine/README.md) — o `Runner` que usa `Tracker`/`Classifier` pra rodar a inferência.
- [internal/db](../db/README.md) — tabelas `camera_state_classifiers`/`camera_state_classes`/`camera_state_history`.
