#!/bin/sh
# CA3: clique na trilha, arraste da alça e preview no hover continuam
# selecionando/posicionando corretamente na nova geometria de cards por
# hora — inclusive sobre os gaps entre cards (áreas sem gravação nenhuma
# entre um card de hora e o próximo). Roda o teste dedicado em
# HistoryTimeline.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code; confirma também que pelo
# menos 1 teste casou e passou (grep por "passed"). Padrão -t
# "CA3interacao" (um token só, sem espaço) — não colide com os testes
# "CA3..." já existentes em HistoryTimeline.test.tsx (CA3, CA3linesnap,
# CA3snap).
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA3interacao' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"CA3interacao\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"CA3interacao\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA3 OK"
