#!/bin/sh
# CA2: a régua de 24h aparece abaixo do player no Histórico, com um bloco
# por hora colorido pela categoria dominante e o resumo "N gravações · pico
# entre Xh e Yh". Roda o teste dedicado em HistoryTimeline.test.tsx via
# Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code, senão este cenário passaria
# falsamente antes de o teste "CA2" sequer existir. Confirma também que pelo
# menos 1 teste casou e passou (grep por "passed" no resumo do vitest).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA2' >"$out" 2>&1; then
  echo "CA2 FALHOU: teste(s) \"CA2\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA2 FALHOU: nenhum teste nomeado \"CA2\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA2 OK"
