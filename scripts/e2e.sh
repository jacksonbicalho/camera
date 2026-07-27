#!/usr/bin/env bash
# Orquestra a suíte e2e (Playwright) — tudo em Docker, nada no host além do
# docker. Sobe dois serviços (e2e/docker-compose.yml): `e2e-camera` (imagem
# que semeia o fixture e roda o servidor) e `e2e-playwright` (roda os specs
# contra http://e2e-camera:8099). O exit code do Playwright vira o exit code
# deste script; teardown remove tudo.
#
# Invocação estática (scripts/e2e.sh) para o allowlist do Claude Code
# funcionar. Requisito no host: apenas docker (+ compose).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/e2e/docker-compose.yml")

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# --abort-on-container-exit: quando o e2e-playwright termina, derruba o e2e-camera.
# --exit-code-from e2e-playwright: propaga o resultado dos testes como exit do script.
"${COMPOSE[@]}" up --build --abort-on-container-exit --exit-code-from e2e-playwright
