#!/bin/sh
# CA3: cor de cada categoria é determinística — mesmo label sempre a mesma
# cor via hash — com movimento/pessoa/estados mantendo cor fixa conhecida
# (categoryColor, frontend/src/pages/eventCategory.ts).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/eventCategory.test.ts -t 'CA3cor' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"CA3cor\" em eventCategory.test.ts falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"CA3cor\" encontrado em eventCategory.test.ts"
  exit 1
fi

echo "CA3 OK"
