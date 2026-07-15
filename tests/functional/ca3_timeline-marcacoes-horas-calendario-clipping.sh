#!/bin/sh
# CA3: o popover do calendário (DatePicker) renderiza fora de qualquer
# container com overflow-hidden (via portal), não ficando mais clipado
# dentro da lista de gravações do Histórico. Roda o teste dedicado em
# DatePicker.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code. Confirma também que pelo
# menos 1 teste casou e passou (grep por "passed" no resumo do vitest).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/DatePicker.test.tsx -t 'CA3' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"CA3\" em DatePicker.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"CA3\" encontrado em DatePicker.test.tsx"
  exit 1
fi
echo "CA3 OK"
