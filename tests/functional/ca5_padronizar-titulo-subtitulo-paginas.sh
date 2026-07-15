#!/bin/sh
# CA5: o nome da câmera não aparece mais duplicado no rodapé do player do Ao
# Vivo — o rodapé continua existindo com mudo/tela cheia/abas quando
# controls/footerTrailing estão presentes, mesmo sem title. Roda o teste
# dedicado em Player.test.tsx via Docker (scripts/frontend-check.sh).
#
# Ver comentário em ca2_padronizar-titulo-subtitulo-paginas.sh: exit 0 do
# vitest não basta (0 testes casando o -t também sai 0) — confirma também que
# ao menos 1 teste casou e passou.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/Player.test.tsx -t 'CA5' >"$out" 2>&1; then
  echo "CA5 FALHOU: teste(s) \"CA5\" em Player.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA5 FALHOU: nenhum teste nomeado \"CA5\" encontrado em Player.test.tsx"
  exit 1
fi
echo "CA5 OK"
