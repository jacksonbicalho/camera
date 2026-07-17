#!/bin/sh
# CA4: prioridade de categoria num chunk com múltiplos labels distintos
# resolve de forma determinística (pessoa no topo, estados no fundo,
# desempate por contagem e depois alfabético entre labels específicos) —
# recordingCategory, frontend/src/pages/eventCategory.ts.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/eventCategory.test.ts -t 'CA4prioridade' >"$out" 2>&1; then
  echo "CA4 FALHOU: teste(s) \"CA4prioridade\" em eventCategory.test.ts falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA4 FALHOU: nenhum teste nomeado \"CA4prioridade\" encontrado em eventCategory.test.ts"
  exit 1
fi

echo "CA4 OK"
