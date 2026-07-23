#!/bin/sh
# CA2: a lista lateral do Histórico (#history-recordings-list /
# #history-recordings-groups) REMOVE do DOM os cards de gravação que não
# batem com o filtro de categoria ativo — nunca esmaece (opacity-40). Roda
# o teste dedicado em HistoryPage.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code, senão este cenário passaria
# falsamente antes de o teste "CA2FiltroOcultaLista" sequer existir. Confirma
# também que pelo menos 1 teste casou e passou (grep por "passed"). Padrão
# "CA2FiltroOcultaLista" (não só "CA2"): este arquivo já tem vários testes
# "CA2..."/"CA6..." de histórias anteriores — precisa de um substring exclusivo.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA2FiltroOcultaLista' >"$out" 2>&1; then
  echo "CA2 FALHOU: teste(s) \"CA2FiltroOcultaLista\" em HistoryPage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA2 FALHOU: nenhum teste nomeado \"CA2FiltroOcultaLista\" encontrado em HistoryPage.test.tsx"
  cat "$out"
  exit 1
fi
echo "CA2 OK"
