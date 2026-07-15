#!/bin/sh
# CA3: o chip "Pessoa" aparece em #history-filter-chips na página de
# Histórico, entre "Movimento" e "Contínua". Roda o teste dedicado em
# HistoryPage.test.tsx via Docker (scripts/frontend-check.sh).
#
# Ver comentário em ca2_historico-filtro-pessoa.sh: exit 0 do vitest não
# basta (0 testes casando o -t também sai 0) — confirma também que ao menos
# 1 teste casou e passou. Padrão -t "CA3pessoa" (um token só, sem espaço):
# frontend-check.sh repassa "$@" via `$*` dentro de um `sh -c` do Docker, que
# faz word-splitting de novo — um padrão com espaço (ex. "CA3: chip") vira
# dois argumentos e o vitest só recebe o pedaço antes do espaço, que ainda
# colide com o teste "CA3: subtítulo..." de uma história anterior (título/
# subtítulo, #516) já existente em HistoryPage.test.tsx.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA3pessoa' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"CA3pessoa\" em HistoryPage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"CA3pessoa\" encontrado em HistoryPage.test.tsx"
  exit 1
fi
echo "CA3 OK"
