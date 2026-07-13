#!/bin/sh
# CA2: o título da página de Histórico é fixo ("Histórico"), independente do
# nome da câmera. Roda o teste dedicado em HistoryPage.test.tsx via Docker
# (scripts/frontend-check.sh), igual ao "CI local" do projeto.
set -eu
cd "$(git rev-parse --show-toplevel)"

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA2'; then
  echo "CA2 FALHOU: título da página Histórico não é fixo em \"Histórico\""
  exit 1
fi
echo "CA2 OK"
