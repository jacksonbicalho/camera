#!/bin/sh
# CA2: a régua (HistoryTimeline) renderiza como cards discretos por hora
# (scroll horizontal, gap visível entre eles), cada card colorido pela
# categoria real de maior prioridade entre suas gravações, com uma linha
# vertical por gravação esmaecida (nunca removida) quando fora do filtro
# ativo. Roda o teste dedicado em HistoryTimeline.test.tsx via Docker
# (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code; confirma também que pelo
# menos 1 teste casou e passou (grep por "passed"). Padrão -t "CA2cards"
# (um token só, sem espaço) — não colide com os testes "CA2..." já
# existentes em HistoryTimeline.test.tsx (CA2, CA2labels, CA2vlines,
# CA2semfiltro).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA2cards' >"$out" 2>&1; then
  echo "CA2 FALHOU: teste(s) \"CA2cards\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA2 FALHOU: nenhum teste nomeado \"CA2cards\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA2 OK"
