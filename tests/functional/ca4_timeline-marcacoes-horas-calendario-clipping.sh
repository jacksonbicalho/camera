#!/bin/sh
# CA4: arrastar a alça do ponteiro no timeline atualiza a posição/preview em
# tempo real sem trocar de gravação a cada movimento. Roda o teste dedicado
# em HistoryTimeline.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code. Confirma também que pelo
# menos 1 teste casou e passou (grep por "passed" no resumo do vitest).
# Padrão -t "CA4drag" (não só "CA4"): este arquivo já tem testes "CA4" de
# uma história anterior (#524) — "CA4" sozinho colidiria com eles.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA4drag' >"$out" 2>&1; then
  echo "CA4 FALHOU: teste(s) \"CA4drag\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA4 FALHOU: nenhum teste nomeado \"CA4drag\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA4 OK"
