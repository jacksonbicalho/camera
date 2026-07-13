#!/bin/sh
# CA3: o subtítulo da página de Histórico mostra o nome da câmera (junto do
# badge de gravação), no lugar do título fixo. Roda o teste dedicado em
# HistoryPage.test.tsx via Docker (scripts/frontend-check.sh).
set -eu
cd "$(git rev-parse --show-toplevel)"

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA3'; then
  echo "CA3 FALHOU: subtítulo da página Histórico não mostra o nome da câmera"
  exit 1
fi
echo "CA3 OK"
