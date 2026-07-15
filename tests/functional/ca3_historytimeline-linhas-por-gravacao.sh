#!/bin/sh
# CA3: clicar ou soltar o arraste em qualquer ponto da régua do
# HistoryTimeline sempre reposiciona a alça para o início de uma gravação
# real (uma linha) — nunca fica num ponto livre/contínuo, mesmo soltando
# dentro da mesma gravação já selecionada (reverte o comportamento antigo
# de "ficar solto onde soltou dentro da gravação"). Roda o teste dedicado
# em HistoryTimeline.test.tsx via Docker (scripts/frontend-check.sh).
#
# yarn test -t <padrão> SEM nenhum teste casando o padrão sai com exit 0
# ("N skipped") — não basta checar o exit code. Confirma também que pelo
# menos 1 teste casou e passou (grep por "passed"). Padrão "CA3linesnap"
# (não só "CA3"/"CA3snap"): este arquivo já tem testes "CA3:"/"CA3snap" de
# histórias anteriores — precisa de um substring exclusivo.
set -eu
cd "$(git rev-parse --show-toplevel)"

out=$(mktemp)
trap 'rm -f "$out"' EXIT

if ! bash scripts/frontend-check.sh src/components/HistoryTimeline.test.tsx -t 'CA3linesnap' >"$out" 2>&1; then
  echo "CA3 FALHOU: teste(s) \"CA3linesnap\" em HistoryTimeline.test.tsx falharam"
  cat "$out"
  exit 1
fi
if ! grep -q '[0-9]\+ passed' "$out"; then
  echo "CA3 FALHOU: nenhum teste nomeado \"CA3linesnap\" encontrado em HistoryTimeline.test.tsx"
  exit 1
fi
echo "CA3 OK"
