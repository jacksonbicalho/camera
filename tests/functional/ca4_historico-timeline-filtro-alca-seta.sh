#!/bin/sh
# CA4: a linha de números das horas fica mais espaçada da trilha/alça (sem
# reduzir a seta — `border-x-8 border-t-8` continuam do jeito que estavam),
# o suficiente pra a ponta da seta não sobrepor os dígitos. Roda o teste
# dedicado em HistoryTimeline.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code; confirma também que pelo
# menos 1 teste casou e passou (grep por "passed"). Padrão -t "CA4spacing"
# (um token só, sem espaço, mesmo motivo dos demais scripts desta pasta) —
# não colide com os vários testes "CA4: ..." já existentes neste arquivo.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA4spacing' >"$out" 2>&1; then
  echo "CA4 FALHOU: teste(s) \"CA4spacing\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA4 FALHOU: nenhum teste nomeado \"CA4spacing\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA4 OK"
