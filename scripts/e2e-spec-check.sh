#!/usr/bin/env bash
# Roda UM spec Playwright do e2e/ rapidamente, reusando o profile
# `development` (docker-compose.yml raiz) — o container e2e-playwright fica
# de pé entre execuções, sem pagar de novo o custo de build+seed+bun
# install+chromium install a cada chamada (mesmo mecanismo documentado no
# CLAUDE.md pra iteração manual local, só que embrulhado num comando
# estático de 1 invocação).
#
# Uso: bash scripts/e2e-spec-check.sh <spec relativo a e2e/>
#   ex.: bash scripts/e2e-spec-check.sh tests/smoke.spec.ts
#
# Pensado pro subagent code-reviewer: ele nunca escreve spec — só roda o que
# o driver já escreveu como parte do TDD do ticket, e lê o resultado (exit
# code + saída do Playwright) em vez de improvisar harness/yarn dev/browser
# por conta própria.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "uso: bash scripts/e2e-spec-check.sh <spec relativo a e2e/, ex. tests/smoke.spec.ts>" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/docker-compose.yml" --profile development)

"${COMPOSE[@]}" up -d --wait e2e-camera e2e-playwright
# --reporter=list força saída legível (nome + pass/fail) no stdout desta
# invocação, independente do E2E_REPORTER configurado (ex.: default local é
# `html`, que não imprime nada aqui — só gera arquivo de relatório).
"${COMPOSE[@]}" exec -T e2e-playwright bunx playwright test --reporter=list "$@"
