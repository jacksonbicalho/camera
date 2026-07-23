#!/bin/sh
# CA3: a régua de 24h (HistoryTimeline) REMOVE do DOM os blocos de hora e
# linhas de gravação que não batem com o filtro de categoria ativo (prop
# `filter`) — nunca esmaece (opacity-40). Sem a prop `filter`, continua
# mostrando tudo (retrocompatibilidade). Roda o teste dedicado em
# HistoryTimeline.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code, senão este cenário passaria
# falsamente antes de o teste "CA3FiltroOcultaRegua" sequer existir. Confirma
# também que pelo menos 1 teste casou e passou (grep por "passed"). Padrão
# "CA3FiltroOcultaRegua" (não só "CA3"): este arquivo já tem vários testes
# "CA2linecolor"/"CA2semfiltro" de histórias anteriores — precisa de um
# substring exclusivo.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA3FiltroOcultaRegua' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"CA3FiltroOcultaRegua\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"CA3FiltroOcultaRegua\" encontrado em HistoryTimeline.test.tsx"
  cat "$out"
  exit 1
fi
echo "CA3 OK"
