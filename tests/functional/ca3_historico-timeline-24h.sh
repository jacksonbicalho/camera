#!/bin/sh
# CA3: clicar num bloco da régua seleciona/reproduz a gravação
# correspondente àquela hora, independente do filtro de chips ativo na
# lista abaixo. Roda o teste dedicado em HistoryTimeline.test.tsx via
# Docker (scripts/frontend-check.sh).
#
# Ver comentário em ca2_historico-timeline-24h.sh: exit 0 do vitest não
# basta (0 testes casando o -t também sai 0) — confirma também que ao menos
# 1 teste casou e passou.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA3' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"CA3\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"CA3\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA3 OK"
