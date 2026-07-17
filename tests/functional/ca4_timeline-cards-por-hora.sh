#!/bin/sh
# CA4: cada card da régua mostra um cabeçalho próprio com a hora e a
# contagem de gravações daquela hora (ex. "14h · 12 gravações"). Roda o
# teste dedicado em HistoryTimeline.test.tsx via Docker
# (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code; confirma também que pelo
# menos 1 teste casou e passou (grep por "passed"). Padrão -t "CA4header"
# (um token só, sem espaço) — não colide com os testes "CA4..." já
# existentes em HistoryTimeline.test.tsx (CA4, CA4drag).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA4header' >"$out" 2>&1; then
  echo "CA4 FALHOU: teste(s) \"CA4header\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA4 FALHOU: nenhum teste nomeado \"CA4header\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA4 OK"
