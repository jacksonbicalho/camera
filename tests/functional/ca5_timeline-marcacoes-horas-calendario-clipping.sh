#!/bin/sh
# CA5: soltar a alça do ponteiro seleciona a gravação mais próxima da
# posição final, exatamente uma vez. Roda o teste dedicado em
# HistoryTimeline.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code. Confirma também que pelo
# menos 1 teste casou e passou (grep por "passed" no resumo do vitest).
# Padrão -t "CA5drag" (não só "CA5"): este arquivo já tem testes "CA5" de
# uma história anterior (#524) — "CA5" sozinho colidiria com eles.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA5drag' >"$out" 2>&1; then
  echo "CA5 FALHOU: teste(s) \"CA5drag\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA5 FALHOU: nenhum teste nomeado \"CA5drag\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA5 OK"
