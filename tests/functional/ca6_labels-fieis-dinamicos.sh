#!/bin/sh
# CA6: a régua do Histórico usa um dropdown com só os labels existentes no
# dia, no lugar dos chips fixos (HistoryPage.tsx).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA6dropdown' >"$out" 2>&1; then
  echo "CA6 FALHOU: teste(s) \"CA6dropdown\" em HistoryPage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA6 FALHOU: nenhum teste nomeado \"CA6dropdown\" encontrado em HistoryPage.test.tsx"
  exit 1
fi

echo "CA6 OK"
