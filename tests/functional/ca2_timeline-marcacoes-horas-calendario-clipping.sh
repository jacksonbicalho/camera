#!/bin/sh
# CA2: a régua de 24h no Histórico mostra rótulos para todas as 24 horas do
# dia, em formato compacto. Roda o teste dedicado em HistoryTimeline.test.tsx
# via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code. Confirma também que pelo
# menos 1 teste casou e passou (grep por "passed" no resumo do vitest).
# Padrão -t "CA2labels" (não só "CA2"): este arquivo já tem testes "CA2"/
# "CA3"/"CA4"/"CA5" de uma história anterior (#524) — "CA2" sozinho
# colidiria com eles e daria falso positivo antes do código deste ticket
# existir.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA2labels' >"$out" 2>&1; then
  echo "CA2 FALHOU: teste(s) \"CA2labels\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA2 FALHOU: nenhum teste nomeado \"CA2labels\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA2 OK"
