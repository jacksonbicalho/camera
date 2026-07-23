#!/bin/sh
# CA4: quando o filtro ativo do Histórico não bate com NENHUMA gravação do
# dia, a lista lateral mostra um estado vazio explícito (em vez de ficar em
# branco sem explicação) e o dropdown de filtro continua visível pra dar
# como voltar a "Tudo". Roda o teste dedicado em HistoryPage.test.tsx via
# Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code, senão este cenário passaria
# falsamente antes de o teste "CA4FiltroEstadoVazio" sequer existir. Confirma
# também que pelo menos 1 teste casou e passou (grep por "passed").
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA4FiltroEstadoVazio' >"$out" 2>&1; then
  echo "CA4 FALHOU: teste(s) \"CA4FiltroEstadoVazio\" em HistoryPage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA4 FALHOU: nenhum teste nomeado \"CA4FiltroEstadoVazio\" encontrado em HistoryPage.test.tsx"
  cat "$out"
  exit 1
fi
echo "CA4 OK"
