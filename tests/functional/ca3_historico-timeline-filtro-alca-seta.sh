#!/bin/sh
# CA3: soltar o arraste (ou clicar) numa lacuna sem nenhuma gravação
# reposiciona a alça pra posição REAL da gravação escolhida por
# proximidade — nunca fica na posição exata do clique/solto quando ali não
# há gravação. Roda o teste dedicado em HistoryTimeline.test.tsx via
# Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code; confirma também que pelo
# menos 1 teste casou e passou (grep por "passed"). Padrão -t "CA3snap"
# (um token só, sem espaço, mesmo motivo dos demais scripts desta pasta) —
# não colide com os vários testes "CA3: ..." já existentes neste arquivo.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA3snap' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"CA3snap\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"CA3snap\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA3 OK"
