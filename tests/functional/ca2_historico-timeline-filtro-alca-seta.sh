#!/bin/sh
# CA2: com um filtro de chip ativo (ex. "Pessoa"), a régua de horas do
# HistoryTimeline só colore blocos com gravações daquela categoria — hora
# que só tinha itens de outra categoria vira bloco neutro. Roda o teste
# dedicado em HistoryPage.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code; confirma também que pelo
# menos 1 teste casou e passou (grep por "passed"). Padrão -t "CA2filtro"
# (um token só, sem espaço — frontend-check.sh repassa via `$*` dentro de
# um `sh -c` do Docker, que faz word-splitting de novo) e não colide com
# os vários testes "CA2: ..." já existentes em HistoryPage.test.tsx.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA2filtro' >"$out" 2>&1; then
  echo "CA2 FALHOU: teste(s) \"CA2filtro\" em HistoryPage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA2 FALHOU: nenhum teste nomeado \"CA2filtro\" encontrado em HistoryPage.test.tsx"
  exit 1
fi
echo "CA2 OK"
