#!/bin/sh
# CA4: passar o mouse sobre a régua mostra um preview com miniatura (via
# event-frame) e o horário correspondente à posição do mouse, sem exigir
# clique nem arraste. Roda o teste dedicado em HistoryTimeline.test.tsx via
# Docker (scripts/frontend-check.sh).
#
# Ver comentário em ca2_historico-timeline-24h.sh: exit 0 do vitest não
# basta (0 testes casando o -t também sai 0) — confirma também que ao menos
# 1 teste casou e passou.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA4' >"$out" 2>&1; then
  echo "CA4 FALHOU: teste(s) \"CA4\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA4 FALHOU: nenhum teste nomeado \"CA4\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA4 OK"
