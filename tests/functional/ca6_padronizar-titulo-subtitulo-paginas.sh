#!/bin/sh
# CA6: a página de Perfil (/profile) mostra o título "Perfil" através do
# componente PageHeader compartilhado, não mais um <h1> solto. Roda o teste
# dedicado em ProfileLayout.test.tsx via Docker (scripts/frontend-check.sh).
#
# Ver comentário em ca2_padronizar-titulo-subtitulo-paginas.sh: exit 0 do
# vitest não basta (0 testes casando o -t também sai 0) — confirma também que
# ao menos 1 teste casou e passou.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/ProfileLayout.test.tsx -t 'CA6' >"$out" 2>&1; then
  echo "CA6 FALHOU: teste(s) \"CA6\" em ProfileLayout.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA6 FALHOU: nenhum teste nomeado \"CA6\" encontrado em ProfileLayout.test.tsx"
  exit 1
fi
echo "CA6 OK"
