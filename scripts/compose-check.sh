#!/usr/bin/env bash
# Verifica a topologia dos docker-compose.yml do projeto via `docker compose config`
# (resolução real do Compose, não leitura de texto) — confirma:
#
#   1. e2e/docker-compose.yml define os serviços `e2e-camera`/`e2e-playwright` (não mais
#      `camera`/`playwright`) — convenção de prefixo (`<contexto>-<coisa>`), pedida pelo
#      navigator, e também evita colisão do `camera` com o `camera` de produção já
#      existente no docker-compose.yml raiz quando incluído nele.
#   2. docker-compose.yml raiz, com --profile development, resolve `e2e-camera` e
#      `e2e-playwright` (via `include:` de e2e/docker-compose.yml) — sem derrubar
#      `dev-camera` (renomeado de `camera-dev`, mesma convenção de prefixo).
#   3. Sem o profile, nenhum dos dois do e2e aparece — confirma que a stack e2e no dev
#      é opt-in, nunca sobe junto de um `docker compose up` comum.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { echo "FALHOU: $1" >&2; exit 1; }

e2e_services="$(docker compose -f e2e/docker-compose.yml config --services)"
echo "$e2e_services" | grep -qx "e2e-camera" \
  || fail "e2e/docker-compose.yml não define 'e2e-camera'"
echo "$e2e_services" | grep -qx "e2e-playwright" \
  || fail "e2e/docker-compose.yml não define 'e2e-playwright'"
echo "$e2e_services" | grep -qx "camera" \
  && fail "e2e/docker-compose.yml ainda define 'camera' (deveria ter sido renomeado pra e2e-camera)"
echo "$e2e_services" | grep -qx "playwright" \
  && fail "e2e/docker-compose.yml ainda define 'playwright' (deveria ter sido renomeado pra e2e-playwright)"
echo "OK: e2e/docker-compose.yml usa 'e2e-camera'/'e2e-playwright'"

dev_services="$(docker compose --profile development config --services)"
echo "$dev_services" | grep -qx "e2e-camera" \
  || fail "docker-compose.yml (raiz, --profile development) não resolve 'e2e-camera'"
echo "$dev_services" | grep -qx "e2e-playwright" \
  || fail "docker-compose.yml (raiz, --profile development) não resolve 'e2e-playwright'"
echo "$dev_services" | grep -qx "dev-camera" \
  || fail "docker-compose.yml (raiz, --profile development) não resolve 'dev-camera' (rename de camera-dev)"
echo "OK: --profile development resolve e2e-camera + e2e-playwright (+ dev-camera)"

default_services="$(docker compose config --services)"
echo "$default_services" | grep -qx "e2e-camera" \
  && fail "'e2e-camera' aparece sem --profile development (deveria ser opt-in)"
echo "$default_services" | grep -qx "e2e-playwright" \
  && fail "'e2e-playwright' aparece sem --profile development (deveria ser opt-in)"
echo "OK: e2e-camera/e2e-playwright não aparecem sem --profile (opt-in confirmado)"

echo "compose-check: tudo verde"
