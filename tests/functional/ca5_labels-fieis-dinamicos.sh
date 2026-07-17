#!/bin/sh
# CA5: filtros da RecordingsPage e histograma da ReportsPage são dinâmicos,
# derivados dos dados carregados — não mais um array fixo de categorias
# (CAT_FILTERS/STACK_ORDER).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/RecordingsPage.test.tsx -t 'CA5dinamico' >"$out" 2>&1; then
  echo "CA5 FALHOU: teste(s) \"CA5dinamico\" em RecordingsPage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA5 FALHOU: nenhum teste nomeado \"CA5dinamico\" encontrado em RecordingsPage.test.tsx"
  exit 1
fi

if ! bash scripts/frontend-check.sh src/pages/ReportsPage.test.tsx -t 'CA5dinamico' >"$out" 2>&1; then
  echo "CA5 FALHOU: teste(s) \"CA5dinamico\" em ReportsPage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA5 FALHOU: nenhum teste nomeado \"CA5dinamico\" encontrado em ReportsPage.test.tsx"
  exit 1
fi

echo "CA5 OK"
