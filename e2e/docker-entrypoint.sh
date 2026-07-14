#!/bin/sh
# Entrypoint da imagem `e2e` (stage do Dockerfile raiz): semeia o fixture
# determinístico num diretório efêmero do container e sobe o servidor já
# apontado pra ele — tudo numa imagem só, sem Go/servidor no host.
set -e

FIXTURE=/data
PORT="${E2E_PORT:-8099}"
RECORDINGS="${E2E_RECORDINGS:-5}"

echo "→ semeando fixture em $FIXTURE ($RECORDINGS gravações)"
./seed -out "$FIXTURE" -port "$PORT" -recordings "$RECORDINGS"

echo "→ subindo servidor camera em :$PORT"
exec ./camera --config "$FIXTURE/camera.yaml"
