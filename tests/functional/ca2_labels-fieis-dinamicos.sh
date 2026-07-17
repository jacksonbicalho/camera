#!/bin/sh
# CA2: categoria de um motion event com label não-pessoa é fiel ao label
# real (não mais bucket genérico "ia"), tanto no backend (MotionCategory,
# internal/db/reports.go) quanto no frontend (eventCategory,
# frontend/src/pages/eventCategory.ts).
#
# Backend: go test -run com padrão que não casa nenhum teste sai 0 mesmo sem
# rodar nada — confirma via -v + grep por "--- PASS: <nome>", não só o exit
# code. Frontend: mesmo cuidado com "yarn test -t" (ver ca2_timeline-cards-
# por-hora.sh) — confirma "N passed" no output, não só o exit code.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! go test -v -run '^TestMotionCategory_FielAoLabelReal$' ./internal/db/... >"$out" 2>&1; then
  echo "CA2 FALHOU: TestMotionCategory_FielAoLabelReal (internal/db) falhou"
  cat "$out"
  exit 1
fi
if ! grep -q -- '--- PASS: TestMotionCategory_FielAoLabelReal' "$out"; then
  echo "CA2 FALHOU: TestMotionCategory_FielAoLabelReal não encontrado em internal/db"
  exit 1
fi

if ! bash scripts/frontend-check.sh src/pages/eventCategory.test.ts -t 'CA2fiel' >"$out" 2>&1; then
  echo "CA2 FALHOU: teste(s) \"CA2fiel\" em eventCategory.test.ts falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA2 FALHOU: nenhum teste nomeado \"CA2fiel\" encontrado em eventCategory.test.ts"
  exit 1
fi

echo "CA2 OK"
