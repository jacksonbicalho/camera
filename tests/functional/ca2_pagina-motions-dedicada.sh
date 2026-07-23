#!/bin/sh
# CA2: a página /motions carrega, lista os momentos do dia em grade com
# thumbnail, e filtro de categoria/câmera/busca + paginação funcionam.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/pages/MotionsPage.test.tsx >"$out" 2>&1; then
  echo "CA2 FALHOU: suíte MotionsPage.test.tsx falhou (ou o arquivo ainda não existe)"
  cat "$out"
  exit 1
fi
echo "CA2 OK"
