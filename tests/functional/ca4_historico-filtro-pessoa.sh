#!/bin/sh
# CA4: clicar no chip "Pessoa" filtra a lista de gravações para mostrar só
# as que têm categoria "pessoa". Roda o teste dedicado em HistoryPage.test.tsx
# via Docker (scripts/frontend-check.sh).
#
# Ver comentário em ca2_historico-filtro-pessoa.sh: exit 0 do vitest não
# basta (0 testes casando o -t também sai 0) — confirma também que ao menos
# 1 teste casou e passou. Padrão -t "CA4pessoa" (um token só, sem espaço):
# frontend-check.sh repassa "$@" via `$*` dentro de um `sh -c` do Docker, que
# faz word-splitting de novo — um padrão com espaço (ex. "CA4: clique") vira
# dois argumentos e o vitest só recebe o pedaço antes do espaço, que ainda
# colide com o teste "CA4: título alinha..." de uma história anterior
# (título/subtítulo, #516) já existente em HistoryPage.test.tsx.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA4pessoa' >"$out" 2>&1; then
  echo "CA4 FALHOU: teste(s) \"CA4pessoa\" em HistoryPage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA4 FALHOU: nenhum teste nomeado \"CA4pessoa\" encontrado em HistoryPage.test.tsx"
  exit 1
fi
echo "CA4 OK"
