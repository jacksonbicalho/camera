#!/usr/bin/env bash
# Roda o tooling do pacote e2e/ (tsc --noEmit + eslint + prettier --check) via
# Docker, mesma imagem (oven/bun:1) usada pelo serviço `playwright` de
# e2e/docker-compose.yml — mas SEM subir o harness (não depende de câmera
# nem Playwright instalado), então é rápido o bastante pra rodar em todo PR
# que toque e2e/, chamado por scripts/check.sh (mesmo padrão de
# frontend-check.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
E2E="$ROOT/e2e"

docker run --rm \
  -v "$E2E":/app -v camera-bun-cache:/root/.bun \
  -w /app oven/bun:1 \
  sh -c "bun install && bunx tsc --noEmit && bunx eslint . && bunx prettier --check . && bun test reporters/pdf-reporter.test.ts"
