#!/bin/sh
# Entrypoint da imagem e2e: semeia o fixture determinístico e sobe o servidor
# contra ele, na mesma imagem (sem Go/servidor no host). O fixture vai para um dir
# efêmero do container (some com o `docker compose down`).
set -e

FIXTURE=/data
PORT="${E2E_PORT:-8099}"
RECORDINGS="${E2E_RECORDINGS:-8}"

echo "→ seeding fixture at $FIXTURE ($RECORDINGS recordings)"
./seed -out "$FIXTURE" -port "$PORT" -recordings "$RECORDINGS"

echo "→ starting camera server on :$PORT"
exec ./camera --config "$FIXTURE/camera.yaml"
