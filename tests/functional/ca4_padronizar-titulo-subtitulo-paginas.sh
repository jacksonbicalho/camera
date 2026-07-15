#!/bin/sh
# CA4: a página Ao Vivo (/live/:id) mostra título "Ao vivo" e subtítulo com o
# nome da câmera (mesmo mecanismo pageTitle que o Histórico já usa). Roda o
# teste dedicado em LivePage.test.tsx via Docker (scripts/frontend-check.sh).
#
# Ver comentário em ca2_padronizar-titulo-subtitulo-paginas.sh: exit 0 do
# vitest não basta (0 testes casando o -t também sai 0) — confirma também que
# ao menos 1 teste casou e passou.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/LivePage.test.tsx -t 'CA4' >"$out" 2>&1; then
  echo "CA4 FALHOU: teste(s) \"CA4\" em LivePage.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA4 FALHOU: nenhum teste nomeado \"CA4\" encontrado em LivePage.test.tsx"
  exit 1
fi
echo "CA4 OK"
