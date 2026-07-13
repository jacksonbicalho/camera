#!/bin/sh
# CA4: o título da página de Histórico alinha horizontalmente com o conteúdo
# abaixo (mesmo cap de largura + centralização do bloco de duas colunas).
# Roda o teste dedicado em HistoryPage.test.tsx via Docker
# (scripts/frontend-check.sh).
set -eu
cd "$(git rev-parse --show-toplevel)"

if ! bash scripts/frontend-check.sh src/pages/HistoryPage.test.tsx -t 'CA4'; then
  echo "CA4 FALHOU: título da página Histórico não alinha com o conteúdo abaixo"
  exit 1
fi
echo "CA4 OK"
