#!/bin/sh
# Entrypoint da imagem `e2e` (stage do Dockerfile raiz): semeia o fixture
# determinístico num diretório efêmero do container e sobe o servidor já
# apontado pra ele — tudo numa imagem só, sem Go/servidor no host.
set -e

FIXTURE=/data
PORT="${E2E_PORT:-8099}"
RECORDINGS="${E2E_RECORDINGS:-5}"

# Ids/credenciais do fixture — este entrypoint só roda orquestrado pelo
# e2e/docker-compose.yml, que sempre injeta as 6 variáveis abaixo (anchor
# x-fixture-env, ÚNICA declaração destes valores no repo); sem fallback
# aqui de propósito, pra não recriar uma cópia divergente em shell. Sem
# elas (uso fora do compose, não suportado), as flags recebem string vazia
# e o seed falha alto — os defaults Go (defaultAdminUser/etc., e2e/seed/main.go)
# só valem quando a flag é OMITIDA, não quando vem vazia.
echo "→ semeando fixture em $FIXTURE ($RECORDINGS gravações)"
./seed -out "$FIXTURE" -port "$PORT" -recordings "$RECORDINGS" \
  -admin-user "$E2E_ADMIN_USER" -admin-pass "$E2E_ADMIN_PASS" -camera-id "$E2E_CAMERA_ID" \
  -admin-only-camera-id "$E2E_ADMIN_ONLY_CAMERA_ID" \
  -viewer-user "$E2E_VIEWER_USER" -viewer-pass "$E2E_VIEWER_PASS"

echo "→ subindo servidor camera em :$PORT"
exec ./camera --config "$FIXTURE/camera.yaml"
