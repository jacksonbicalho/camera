#!/bin/sh
# CA3: a lista lateral (#history-recordings-list) sempre mostra todas as
# gravações do dia — o filtro de categoria esmaece os cards fora dele em
# vez de removê-los. Roda o teste dedicado em HistoryPage.test.tsx via
# Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code. Confirma também que pelo
# menos 1 teste casou e passou (grep por "passed"). Padrão "CA3naoremove"
# (não só "CA3"): este arquivo já tem vários testes "CA3:" de histórias
# anteriores — precisa de um substring exclusivo.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA3naoremove' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"CA3naoremove\" em HistoryPage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"CA3naoremove\" encontrado em HistoryPage.test.tsx"
  exit 1
fi
echo "CA3 OK"
