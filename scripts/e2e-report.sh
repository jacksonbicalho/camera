#!/usr/bin/env bash
# Sobe um servidor estático simples pra visualizar e2e/playwright-report (o
# relatório HTML gerado por `bash scripts/e2e.sh`) — mesma imagem Docker do
# scripts/e2e.sh, sem exigir bun no host. Ctrl+C encerra o servidor.
#
# Uso: scripts/e2e-report.sh [porta]   (default 9323, mesma porta padrão do
# `playwright show-report`)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${1:-9323}"

if [ ! -f "$ROOT/e2e/playwright-report/index.html" ]; then
    echo "❌ e2e/playwright-report/index.html não existe — rode 'bash scripts/e2e.sh' primeiro." >&2
    exit 1
fi

echo "→ playwright-report em http://localhost:${PORT} (Ctrl+C pra encerrar)"
docker run --rm \
    -v "$ROOT/e2e:/e2e" \
    -w /e2e \
    -p "${PORT}:9323" \
    oven/bun:1 \
    sh -c "bun install --silent && bunx playwright show-report --host 0.0.0.0 playwright-report"
