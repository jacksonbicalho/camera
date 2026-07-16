#!/bin/sh
# CA2: cada bloco de hora do HistoryTimeline renderiza uma linha vertical
# por gravação contida nele, posicionada pela fração real do horário de
# início dentro da hora (não distribuída uniformemente por índice). Roda o
# teste dedicado em HistoryTimeline.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code, senão este cenário passaria
# falsamente antes de o teste "CA2vlines" sequer existir. Confirma também
# que pelo menos 1 teste casou e passou (grep por "passed"). Padrão
# "CA2vlines" (não só "CA2"): este arquivo já tem vários testes "CA2:"/
# "CA2labels" de histórias anteriores — precisa de um substring exclusivo.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA2vlines' >"$out" 2>&1; then
  echo "CA2 FALHOU: teste(s) \"CA2vlines\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA2 FALHOU: nenhum teste nomeado \"CA2vlines\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA2 OK"
