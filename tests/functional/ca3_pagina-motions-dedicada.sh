#!/bin/sh
# CA3: o Sidebar tem um item "Momentos" (sidebar-motions) que navega para
# /motions e fica ativo nessa rota.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/Sidebar.test.tsx -t 'sidebar-motions' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"sidebar-motions\" em Sidebar.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"sidebar-motions\" encontrado em Sidebar.test.tsx"
  exit 1
fi
echo "CA3 OK"
