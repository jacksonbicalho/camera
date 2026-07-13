#!/bin/sh
# finalize-story.sh — fecha a story marcando `[x] Aprovado` AUTOMATICAMENTE
# quando (e somente quando) todos os pré-requisitos automáticos estão verdes:
#
#   1. [x] História revisada            (G2 — humano)
#   2. [x] Review: APPROVED             (subagent, via record-review.sh)
#   3. nenhum CA desmarcado             (functional-check.sh)
#
# Mantém o contrato dos scripts existentes: commit.sh, push-pr.sh e o hook de
# aprovação continuam exigindo `[x] Aprovado` — só muda QUEM marca (a máquina,
# quando as evidências existem; nunca o driver à mão).
#
# Uso: scripts/finalize-story.sh [story]

set -eu
cd "$(git rev-parse --show-toplevel)"
. scripts/lib/story.sh

story=$(resolve_story "${1:-}")

fail() { echo "bloqueado: $1 (story: $story)" >&2; exit 1; }

checkbox_marked "$story" '.*revisada' \
  || fail "gate G2 fechado — falta [x] História revisada"

checkbox_marked "$story" 'Review: APPROVED' \
  || fail "code review incompleto — falta [x] Review: APPROVED (todos os tickets)"

if grep -qE '^[[:space:]]*-[[:space:]]*\[\][[:space:]]*CA[0-9]+' "$story"; then
  pend=$(grep -oE '^[[:space:]]*-[[:space:]]*\[\][[:space:]]*CA[0-9]+' "$story" \
         | grep -oE 'CA[0-9]+' | tr '\n' ' ')
  fail "critérios de aceite pendentes: $pend— rode scripts/functional-check.sh"
fi

if checkbox_marked "$story" 'aprovado[[:space:]]*$'; then
  echo "já aprovada (idempotente): $story"
else
  mark_checkbox "$story" "Aprovado"
  echo "story finalizada: [x] Aprovado — $story"
fi
echo "próximo passo: scripts/push-pr.sh"
