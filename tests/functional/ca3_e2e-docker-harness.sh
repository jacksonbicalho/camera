#!/bin/sh
# CA3: o harness Docker (e2e/docker-compose.yml, Dockerfile stage `e2e`) sobe
# o servidor já semeado e ele responde saudável, sem setup manual.
set -eu
cd "$(git rev-parse --show-toplevel)"

[ -f e2e/docker-compose.yml ] || { echo "CA3 FALHOU: e2e/docker-compose.yml não existe ainda"; exit 1; }
grep -q 'AS e2e' Dockerfile 2>/dev/null || { echo "CA3 FALHOU: Dockerfile não tem stage 'e2e' ainda"; exit 1; }

COMPOSE="docker compose -f e2e/docker-compose.yml"
cleanup() { $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

$COMPOSE up -d --build camera >/tmp/ca3_up.log 2>&1 || {
  echo "CA3 FALHOU: docker compose up do serviço camera falhou:"; cat /tmp/ca3_up.log; exit 1;
}

ok=0
i=0
while [ "$i" -lt 30 ]; do
  status=$($COMPOSE ps camera --format json 2>/dev/null | grep -o '"Health":"[a-z]*"' | cut -d'"' -f4 || true)
  if [ "$status" = "healthy" ]; then ok=1; break; fi
  i=$((i + 1))
  sleep 2
done

[ "$ok" = "1" ] || {
  echo "CA3 FALHOU: serviço camera não ficou 'healthy' a tempo"; $COMPOSE logs camera; exit 1;
}

echo "CA3 OK"
